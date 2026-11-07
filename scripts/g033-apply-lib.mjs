// =============================================================================
// G033 — 결정 json 을 DB 에 쓰는 공용 몸통(g020-apply-active.mjs 꼴 · 멱등 · 한 트랜잭션 · 되돌리기 json)
//   결정 items[id] = { step, cv, before:{question_text,explanation,general_hint,display_answer,difficulty_score,variants,status,is_active},
//                      question_text?, explanation?(null = 비움), general_hint?, display_answer?, difficulty_score?,
//                      add?:[], remove?:[], activate?:true, reject?:사유, deactivate?:사유, report?:app_reports.id,
//                      why, sources?, notTaken?:[{field, proposal, why}] }
//   ★ 쓰기: 지금 값이 before 와 같을 때만(after 와 같으면 이미 됨 · 다르면 건너뛰고 목록) · 열린 판 0(guardNoOpenGames)
//   ★ 반영 뒤 모습 검사(활성 될 행 · 활성 행): checkAnswerSet 막힘 0 · blankCheck · 질문 240자(200자 넘으면 경고) · checkHint 막힘 0 · 힌트 120자 · crossans 경고
//   되돌리기: undo json steps[step] = rows(id · field · before · after) — --undo 는 지금 값이 after 일 때만 before 로
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHint } from './hint-check.mjs';
import { crossAnswers } from './hint-crossans.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';
import { connect, guardNoOpenGames } from './g023-common.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const L = (s) => [...(s ?? '')].length;
const A5 = (v) => /[^\p{L}\p{N} ]/u.test(v);
const TEXT = ['question_text', 'explanation', 'general_hint', 'display_answer'];
const diffOf = (s) => (s <= 2 ? 'easy' : s === 3 ? 'medium' : 'hard');

export async function run({ tag, decFile, undoFile, steps, mode, note }) {
  const all = JSON.parse(readFileSync(AUD(decFile), 'utf8')).items;
  const sel = Object.entries(all).filter(([, d]) => !steps || steps.includes(d.step)).sort((a, b) => Number(a[0]) - Number(b[0]));
  const c = await connect();
  try {
    if (mode === 'undo' || mode === 'undo-dry') return await undo(c, { tag, undoFile, steps, dry: mode === 'undo-dry' });
    const ids = sel.map(([id, d]) => Number(d.id ?? id)); // 키 '7373#2' 꼴(같은 행 두 번째 결정)은 d.id 로 행을 가리킨다
    const db = (await c.query(`select q.id::int, q.is_active, q.status, q.inactive_reason, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.difficulty_score,
      coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
      from questions q where q.id = any($1::bigint[])`, [ids])).rows;
    const D = new Map(db.map((r) => [r.id, r]));
    const prim = (await c.query(`select id::int, display_answer from questions where is_active`)).rows.map((r) => ({ id: r.id, norm: normalizeAnswer(r.display_answer), answer: r.display_answer }));
    const todo = []; const skipped = []; const problems = []; const warns = []; const notTaken = []; let done = 0; const cnt = {};
    const k = (x) => { cnt[x] = (cnt[x] ?? 0) + 1; };
    for (const [sid, d] of sel) {
      const id = Number(d.id ?? sid); const cur = D.get(id); if (!cur) { problems.push(`${id}: 없음`); continue; }
      for (const n of d.notTaken ?? []) notTaken.push({ id, step: d.step, cv: d.cv, ...n });
      const b = d.before ?? {};
      const after = { question_text: cur.question_text, explanation: cur.explanation, general_hint: cur.general_hint, display_answer: cur.display_answer, variants: [...cur.variants] };
      const t = []; const rows = [];
      for (const col of TEXT) {
        if (d[col] === undefined) continue;
        if (cur[col] === d[col]) { done++; after[col] = d[col]; continue; }
        if (cur[col] !== b[col]) { skipped.push(`${id} ${col}: DB 값이 before 와 다름`); continue; }
        after[col] = d[col]; t.push({ col, before: cur[col], after: d[col] }); k(col);
      }
      let score = null;
      if (d.difficulty_score !== undefined) {
        if (cur.difficulty_score === d.difficulty_score) done++;
        else if (cur.difficulty_score !== b.difficulty_score) skipped.push(`${id} difficulty_score: before 와 다름`);
        else { score = { before: cur.difficulty_score, after: d.difficulty_score }; k('difficulty_score'); }
      }
      const remove = (d.remove ?? []).filter((v) => after.variants.includes(v));
      const keep = after.variants.filter((v) => !remove.includes(v));
      const add = [];
      for (const v of d.add ?? []) {
        if (A5(v)) { notTaken.push({ id, step: d.step, cv: d.cv, field: 'variants', proposal: [v], why: '15 A5 — 특수문자' }); continue; }
        if (keep.some((x) => normalizeAnswer(x) === normalizeAnswer(v)) || normalizeAnswer(after.display_answer) === normalizeAnswer(v)) { if (keep.includes(v)) done++; continue; }
        if (add.some((x) => normalizeAnswer(x) === normalizeAnswer(v))) continue;
        add.push(v);
      }
      const g = checkAnswerSet(after.question_text, after.display_answer, [...keep, ...add], normalizeAnswer);
      for (const x of g.dropped) if (add.includes(x.answer)) notTaken.push({ id, step: d.step, cv: d.cv, field: 'variants', proposal: [x.answer], why: `게이트 ${x.kind} — ${x.why}` });
      const finalAdd = add.filter((v) => !g.dropped.some((x) => x.answer === v));
      after.variants = [...keep, ...finalAdd];
      for (const v of remove) k('variant-remove'); for (const v of finalAdd) k('variant-add');
      let st = null;
      if (d.activate) { if (cur.is_active && cur.status === 'approved') done++; else if (cur.status !== 'pending_review') skipped.push(`${id}: pending 아님(${cur.status})`); else { st = { to: 'activate' }; k('activate'); } }
      if (d.reject) { const r = `${tag} — ${d.reject}`; if (cur.status === 'rejected' && cur.inactive_reason === r) done++; else if (cur.is_active) skipped.push(`${id}: 활성 — reject 안 함`); else { st = { to: 'reject', reason: r }; k('reject'); } }
      if (d.deactivate) { const r = `${tag} — ${d.deactivate}`; if (!cur.is_active && cur.inactive_reason === r) done++; else if (!cur.is_active) skipped.push(`${id}: 이미 비활성`); else { st = { to: 'deactivate', reason: r }; k('deactivate'); } }
      if (!d.activate && !d.reject && !d.deactivate && !cur.is_active) { skipped.push(`${id}: 비활성 행 — 활성 고침 도구는 건드리지 않음`); continue; }
      // 반영 뒤 모습 검사 — 활성으로 남거나 될 행만
      const willActive = (cur.is_active && !d.deactivate) || d.activate;
      if (willActive) {
        const q = after.question_text;
        if (!blankCheck(q, after.display_answer).ok) problems.push(`${id}: 빈칸 수`);
        if (L(q) > 240) problems.push(`${id}: 질문 ${L(q)}자 > 240`); else if (L(q) > 200 && t.some((x) => x.col === 'question_text')) warns.push(`${id}: 질문 ${L(q)}자(200 넘음)`);
        const g2 = checkAnswerSet(q, after.display_answer, after.variants, normalizeAnswer);
        if (g2.blocked.length) problems.push(`${id}: 정답 묶음 막힘 ${JSON.stringify(g2.blocked)}`);
        if (after.general_hint) {
          if (L(after.general_hint) > 120) problems.push(`${id}: 힌트 ${L(after.general_hint)}자`);
          const ck = checkHint({ hint: after.general_hint, answer: after.display_answer, variants: after.variants, question: q, explanation: after.explanation ?? '' });
          if (ck.block.length) problems.push(`${id}: checkHint 막힘 ${JSON.stringify(ck.block.map((x) => x.frag ?? x.kind))}`);
          if (t.some((x) => x.col === 'general_hint')) {
            for (const w of ck.warn) warns.push(`${id}: 힌트 ${w.kind}${w.frag ? ' ' + w.frag : ''}${w.shared ? ' ' + w.shared.join('/') : ''}`);
            const cr = crossAnswers({ id, hint: after.general_hint, answerNorm: normalizeAnswer(after.display_answer) }, prim);
            if (cr.length) warns.push(`${id}: crossans ${cr.map((x) => `#${x.id} ${x.answer}`).join(' · ')}`);
          }
        }
      }
      if (t.length || finalAdd.length || remove.length || score || st || d.report) todo.push({ id, d, t, add: finalAdd, remove, score, st, cur });
    }
    console.log(`[${tag}] 결정 ${sel.length} · 쓸 행 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length} · 안 받음 ${notTaken.length} · ${JSON.stringify(cnt)}`);
    for (const s of skipped) console.log('  건너뜀', s);
    for (const w of warns) console.log('  경고', w);
    if (problems.length) { for (const p of problems) console.error('★', p); process.exitCode = 1; return; }
    if (mode !== 'apply') { console.log(`[${tag}] 확인만 — 쓰려면 --apply`); return { todo, notTaken }; }
    const at = await guardNoOpenGames(c, tag);
    await c.query('begin');
    const rows = []; let n = 0; let want = 0;
    for (const x of todo) {
      const { id, d } = x;
      for (const v of x.remove) { want++; const r = await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary returning note', [id, v]); n += r.rowCount; rows.push({ id, field: 'variant', before: v, after: null, beforeNote: r.rows[0]?.note ?? null }); }
      for (const y of x.t) {
        want++;
        if (y.col === 'general_hint') { n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and general_hint is not distinct from $4', [id, y.after, y.after == null ? null : 'hint-v7', y.before])).rowCount; rows.push({ id, field: y.col, before: y.before, after: y.after, beforeVersion: x.cur.general_hint_version }); }
        else if (y.col === 'display_answer') {
          n += (await c.query('update questions set display_answer=$2, updated_at=now() where id=$1 and display_answer=$3', [id, y.after, y.before])).rowCount;
          want++; n += (await c.query('update question_answers set answer_text=$2, answer_norm=$3 where question_id=$1 and is_primary and answer_text=$4', [id, y.after, normalizeAnswer(y.after), y.before])).rowCount;
          rows.push({ id, field: y.col, before: y.before, after: y.after });
        } else { n += (await c.query(`update questions set ${y.col}=$2, updated_at=now() where id=$1 and ${y.col} is not distinct from $3`, [id, y.after, y.before])).rowCount; rows.push({ id, field: y.col, before: y.before, after: y.after }); }
      }
      if (x.score) { want++; n += (await c.query('update questions set difficulty_score=$2, difficulty=$3, difficulty_why=coalesce(difficulty_why,\'\') || $4, updated_at=now() where id=$1 and difficulty_score=$5', [id, x.score.after, diffOf(x.score.after), ` · ${tag} ${d.cv} ${x.score.before}→${x.score.after}`, x.score.before])).rowCount; rows.push({ id, field: 'difficulty_score', before: x.score.before, after: x.score.after }); }
      for (const v of x.add) { want++; n += (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [id, v, normalizeAnswer(v), `${tag} ${d.cv} 변형 추가`])).rowCount; rows.push({ id, field: 'variant', before: null, after: v }); }
      if (x.st) {
        want++;
        const bf = { is_active: x.cur.is_active, status: x.cur.status, inactive_reason: x.cur.inactive_reason };
        if (x.st.to === 'activate') n += (await c.query(`update questions set is_active=true, status='approved', approved_at=now(), inactive_reason=null, updated_at=now() where id=$1 and status='pending_review' and not is_active`, [id])).rowCount;
        else if (x.st.to === 'reject') n += (await c.query(`update questions set status='rejected', inactive_reason=$2, updated_at=now() where id=$1 and not is_active`, [id, x.st.reason])).rowCount;
        else n += (await c.query('update questions set is_active=false, inactive_reason=$2, updated_at=now() where id=$1 and is_active', [id, x.st.reason])).rowCount;
        rows.push({ id, field: 'state', before: bf, after: x.st });
      }
      if (d.report) { want++; n += (await c.query(`update app_reports set note = coalesce(note || ' · ', '') || $2 where id=$1 and coalesce(note,'') not like '%' || $2 || '%'`, [d.report, `${tag} 고침`])).rowCount; rows.push({ id, field: 'report', report: d.report }); }
      for (const r of rows) if (!r._d) r._d = d;
    }
    for (const r of rows) { const d = r._d; delete r._d; r.step = d.step; r.cv = d.cv; r.why = d.why; }
    if (n !== want) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${want} — 되돌렸다`); process.exitCode = 1; return; }
    await c.query('commit');
    const u = existsSync(AUD(undoFile)) ? JSON.parse(readFileSync(AUD(undoFile), 'utf8')) : { round: 'G033', note, steps: {} };
    for (const s of new Set(todo.map((x) => x.d.step))) { u.steps[s] = { at, rows: [...(u.steps[s]?.rows ?? []), ...rows.filter((r) => r.step === s)] }; }
    u.notTaken = [...(u.notTaken ?? []).filter((x) => !(steps ?? []).includes(x.step)), ...notTaken];
    writeFileSync(AUD(undoFile), JSON.stringify(u, null, 1) + '\n');
    console.log(`[${tag}] 썼다 ${n}행 · ${at} · 되돌리기 ${undoFile}`);
  } finally { await c.end(); }
}

async function undo(c, { tag, undoFile, steps, dry }) {
  const u = JSON.parse(readFileSync(AUD(undoFile), 'utf8'));
  const ss = Object.keys(u.steps).filter((s) => !steps || steps.includes(s));
  const rows = ss.flatMap((s) => u.steps[s].rows).reverse();
  if (!dry) await guardNoOpenGames(c, `${tag} undo`);
  await c.query('begin'); let n = 0;
  for (const r of rows) {
    if (r.field === 'variant') n += r.after != null ? (await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary', [r.id, r.after])).rowCount
      : (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [r.id, r.before, normalizeAnswer(r.before), r.beforeNote])).rowCount;
    else if (r.field === 'general_hint') n += (await c.query('update questions set general_hint=$2, general_hint_version=$3 where id=$1 and general_hint is not distinct from $4', [r.id, r.before, r.beforeVersion, r.after])).rowCount;
    else if (r.field === 'display_answer') { n += (await c.query('update questions set display_answer=$2 where id=$1 and display_answer=$3', [r.id, r.before, r.after])).rowCount; await c.query('update question_answers set answer_text=$2, answer_norm=$3 where question_id=$1 and is_primary and answer_text=$4', [r.id, r.before, normalizeAnswer(r.before), r.after]); }
    else if (r.field === 'difficulty_score') n += (await c.query('update questions set difficulty_score=$2, difficulty=$3 where id=$1 and difficulty_score=$4', [r.id, r.before, diffOf(r.before), r.after])).rowCount;
    else if (r.field === 'state') n += (await c.query('update questions set is_active=$2, status=$3, inactive_reason=$4 where id=$1', [r.id, r.before.is_active, r.before.status, r.before.inactive_reason])).rowCount;
    else if (r.field === 'report') n += 1;
    else n += (await c.query(`update questions set ${r.field}=$2 where id=$1 and ${r.field} is not distinct from $3`, [r.id, r.before, r.after])).rowCount;
  }
  if (dry || n !== rows.length) { await c.query('rollback'); console.log(`[${tag} undo] ${dry ? '확인만' : '★ 수 다름 — 되돌림'} — 되돌릴 행 ${n}/${rows.length} (${ss.join(',')})`); if (!dry) process.exitCode = 1; return; }
  await c.query('commit'); console.log(`[${tag} undo] 되돌렸다 ${n}/${rows.length}`);
}

export function cli(tag, decFile, undoFile, note) {
  const a = process.argv.slice(2);
  const mode = a.includes('--undo') ? (a.includes('--dry-run') ? 'undo-dry' : 'undo') : a.includes('--apply') ? 'apply' : 'dry';
  const i = a.indexOf('--step'); const steps = i >= 0 ? a[i + 1].split(',') : null;
  return run({ tag, decFile, undoFile, steps, mode, note });
}
