#!/usr/bin/env node
// =============================================================================
// G020 — 기존 활성 고침 (CV-60 · 61 · 62 · 64 · 65 · 66 · 찬종 제보 4 — g017-apply-active1.mjs 꼴)
//   입력  data/pipeline/audit/g020-decisions.json  items[id] = { cv, before:{question_text,explanation,general_hint,variants,display_answer,is_active},
//                                                    question_text?, explanation?, general_hint?(null = 비움), display_answer?, add?:[], remove?:[],
//                                                    deactivate?: 사유, skip?: 사유, report?: app_reports.id, why, sources?, hintSources?, notTaken?:[] }
//   출력  data/pipeline/audit/g020-undo.json  rows(id · field · before · after · why · sources) · notTaken · skipped — ★ 되돌리기 파일
//   사용  node scripts/g020-apply-active.mjs [--apply]
//   ★ 기본은 확인만 · 한 트랜잭션 · 대상 행의 지금 값이 before 와 같을 때만 쓴다(after 와 같으면 이미 됨 — 멱등 · 다르면 건너뛰고 목록)
//   ★ 반영 뒤 모습으로 검사: checkAnswerSet(막힘 0 — 정답 노출 포함) · blankCheck · 질문 200자 · checkHint(막힘 0) · 힌트 120자
//   ★ 쓰는 칸: question_text · explanation · general_hint(+version hint-v5 · 비우면 둘 다 null) · display_answer(+대표 정답 행)
//             · question_answers 비대표 행 빼기(먼저) · 넣기 · is_active(false + inactive_reason) · updated_at · app_reports.note 에 "G020 고침" 덧붙임
//   되돌리기: rows[].before 로 — question_answers 는 after 행 지우기 · before 행 되살리기 · is_active 는 다시 true · inactive_reason null
//             · display_answer 는 대표 정답 행도 함께 · general_hint 를 되살릴 때 version 은 before.general_hint_version
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck, answerFragments } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const APPLY = process.argv.includes('--apply');
const DEC = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g020-decisions.json'), 'utf8')).items;
const OUT = path.join(ROOT, 'data/pipeline/audit/g020-undo.json');
const A5 = (v) => /[^\p{L}\p{N} ]/u.test(v);
const TEXT_COLS = ['question_text', 'explanation', 'general_hint'];
const NOTE = 'G020 고침';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  const sel = Object.entries(DEC).sort((x, y) => Number(x[0]) - Number(y[0]));
  const ids = sel.map(([id]) => Number(id));
  const { rows: db } = await c.query(`select q.id, q.is_active, q.inactive_reason, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version,
    coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
    from questions q where q.id = any($1::bigint[])`, [ids]);
  const D = new Map(db.map((r) => [Number(r.id), r]));
  const rows = []; const notTaken = []; const skipped = []; const problems = []; const todo = []; const deact = []; const reports = []; let done = 0;
  const byField = {};
  const count = (cv, f) => { byField[cv] ??= {}; byField[cv][f] = (byField[cv][f] ?? 0) + 1; };
  for (const [sid, d] of sel) {
    const id = Number(sid); const cur = D.get(id); if (!cur) { problems.push(`${id}: 없음`); continue; }
    if (d.skip) { skipped.push(`${id}: ${d.skip}`); continue; }
    for (const n of d.notTaken ?? []) notTaken.push({ id, cv: d.cv, ...n });
    const reason = d.deactivate ? `G020 ${d.cv} — ${d.deactivate}` : null;
    if (!cur.is_active && !(reason && cur.inactive_reason === reason)) { skipped.push(`${id}: 활성 아님 — 건너뜀`); continue; }
    if (d.report) reports.push(d.report);
    const after = { question_text: cur.question_text, explanation: cur.explanation, general_hint: cur.general_hint, display_answer: cur.display_answer, variants: [...cur.variants] };
    const t = [];
    for (const col of [...TEXT_COLS, 'display_answer']) {
      if (d[col] === undefined) continue;
      rows.push({ id, cv: d.cv, field: col, before: d.before[col], after: d[col], ...(col === 'general_hint' ? { beforeVersion: cur.general_hint_version } : {}), why: d.why, sources: col === 'general_hint' ? (d.hintSources ?? null) : (d.sources ?? null) });
      count(d.cv, col);
      if (cur[col] === d[col]) { done++; after[col] = d[col]; continue; }
      if (cur[col] !== d.before[col]) { skipped.push(`${id} ${col}: DB 값이 before 와 다름 — 건너뜀`); continue; }
      after[col] = d[col]; t.push({ col, before: cur[col], after: d[col] });
    }
    // 변형 — 빼기 먼저(대표 정답과 겹치는 비대표 행) · 넣기(A5 · 정규화 중복 · 게이트가 떨어뜨리는 것은 넣지 않음)
    const remove = (d.remove ?? []).filter((v) => after.variants.includes(v));
    for (const v of d.remove ?? []) if (!after.variants.includes(v) && d.before.variants.includes(v)) { done++; rows.push({ id, cv: d.cv, field: 'question_answers', before: v, after: null, why: d.why }); }
    const keep = after.variants.filter((v) => !(d.remove ?? []).includes(v));
    const add = []; const dropped = [];
    for (const v of d.add ?? []) {
      if (A5(v)) { dropped.push({ answer: v, why: '15 A5 — 특수문자' }); continue; }
      if (keep.includes(v)) { done++; if (!d.before.variants.includes(v)) rows.push({ id, cv: d.cv, field: 'question_answers', before: null, after: v, why: d.why, sources: d.sources ?? null }); continue; }
      add.push(v);
    }
    const g = checkAnswerSet(after.question_text, after.display_answer, [...keep, ...add], normalizeAnswer);
    for (const x of g.dropped) if (add.includes(x.answer)) dropped.push({ answer: x.answer, why: `게이트 ${x.kind} — ${x.why}` });
    const finalAdd = add.filter((v) => !g.dropped.some((x) => x.answer === v));
    after.variants = [...keep, ...finalAdd];
    for (const v of remove) { rows.push({ id, cv: d.cv, field: 'question_answers', before: v, after: null, why: d.why }); count(d.cv, 'variant-remove'); }
    for (const v of finalAdd) { rows.push({ id, cv: d.cv, field: 'question_answers', before: null, after: v, why: d.why, sources: d.sources ?? null }); count(d.cv, 'variant-add'); }
    for (const x of dropped) notTaken.push({ id, cv: d.cv, field: 'variants', proposal: [x.answer], why: `넣지 않음 — ${x.why}` });
    let act = null;
    if (reason) { rows.push({ id, cv: d.cv, field: 'is_active', before: true, after: false, why: reason }); count(d.cv, 'deactivate'); if (!cur.is_active) done++; else act = { to: false, reason }; }
    // 반영 뒤 모습 검사(비활성 대상은 건너뜀)
    if (!reason) {
      if (!blankCheck(after.question_text, after.display_answer).ok) problems.push(`${id}: 빈칸 수`);
      if ([...after.question_text].length > 200) problems.push(`${id}: 질문 200자 초과 (${[...after.question_text].length})`);
      const g2 = checkAnswerSet(after.question_text, after.display_answer, after.variants, normalizeAnswer);
      if (g2.blocked.length) problems.push(`${id}: 정답 묶음 막힘 ${JSON.stringify(g2.blocked)}`);
      if (d.question_text !== undefined) { const fr = answerFragments(after.question_text, after.display_answer); if (fr?.length) console.log(`  (정답 조각 경고) ${id}: ${JSON.stringify(fr)}`); }
      if (after.general_hint) {
        if ([...after.general_hint].length > 120) problems.push(`${id}: 힌트 120자 초과`);
        const k = checkHint({ hint: after.general_hint, answer: after.display_answer, variants: after.variants, question: after.question_text, explanation: after.explanation ?? '' });
        if (k.block.length) problems.push(`${id}: checkHint 막힘 ${JSON.stringify(k.block)}`);
        if (k.warn.length) console.log(`  (힌트 경고) ${id}: ${JSON.stringify(k.warn)}`);
      }
    }
    if (t.length || finalAdd.length || remove.length) todo.push({ id, cv: d.cv, t, add: finalAdd, remove });
    if (act) deact.push({ id, ...act });
  }
  const { rows: rep } = await c.query('select id, note from app_reports where id = any($1::bigint[])', [reports]);
  const repTodo = rep.filter((r) => !(r.note ?? '').includes(NOTE));
  const out = { round: 'G020', at: new Date().toISOString(), note: 'G020 A 되돌리기 파일 — rows[].before 가 쓰기 전 값(맨 위 머리글 참고) · notTaken 은 받지 않은 제안과 사유 · reports 는 note 에 "G020 고침" 을 덧붙인 app_reports.id(되돌리기 = 그 꼬리 지우기)',
    counts: { decisions: ids.length, todo: todo.length, deactivate: deact.length, done, skipped: skipped.length, rows: rows.length, notTaken: notTaken.length, reports: reports.length }, byField, reports, skipped, rows, notTaken };
  console.log(`[g020 A] 결정 ${ids.length} · 할 일 ${todo.length} · 비활성 ${deact.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length} · rows ${rows.length} · notTaken ${notTaken.length} · 제보 note ${repTodo.length}/${reports.length}`);
  for (const [cv, f] of Object.entries(byField)) console.log(`  ${cv}: ${Object.entries(f).map((x) => x.join(' ')).join(' · ')}`);
  for (const s of skipped) console.log('  ', s);
  for (const n of notTaken) console.log('   notTaken', n.id, JSON.stringify(n.proposal), n.why);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[g020 A] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  if (!todo.length && !deact.length && !repTodo.length) { console.log('[g020 A] 할 일 0'); process.exit(0); }
  await c.query('begin');
  let n = 0; let want = 0;
  for (const r of todo) {
    for (const a of r.remove) { want++; n += (await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary', [r.id, a])).rowCount; }
    for (const x of r.t) {
      want++;
      if (x.col === 'general_hint') n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and general_hint is not distinct from $4', [r.id, x.after, x.after == null ? null : 'hint-v5', x.before])).rowCount;
      else if (x.col === 'display_answer') {
        n += (await c.query('update questions set display_answer=$2, updated_at=now() where id=$1 and display_answer=$3', [r.id, x.after, x.before])).rowCount;
        want++; n += (await c.query('update question_answers set answer_text=$2, answer_norm=$3, note=$4 where question_id=$1 and is_primary and answer_text=$5', [r.id, x.after, normalizeAnswer(x.after), `G020 대표 정답 바꿈(전 ${x.before})`, x.before])).rowCount;
      } else n += (await c.query(`update questions set ${x.col}=$2, updated_at=now() where id=$1 and ${x.col} is not distinct from $3`, [r.id, x.after, x.before])).rowCount;
    }
    for (const a of r.add) { want++; n += (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [r.id, a, normalizeAnswer(a), `G020 ${r.cv} 변형 추가`])).rowCount; }
  }
  for (const x of deact) { want++; n += (await c.query('update questions set is_active=false, inactive_reason=$2, updated_at=now() where id=$1 and is_active', [x.id, x.reason])).rowCount; }
  for (const r of repTodo) { want++; n += (await c.query(`update app_reports set note = coalesce(note || ' · ', '') || $2 where id=$1 and coalesce(note,'') not like '%' || $2 || '%'`, [r.id, NOTE])).rowCount; }
  if (n !== want) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${want} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[g020 A] 썼다 — ${n}행`);
} finally { await c.end(); }
