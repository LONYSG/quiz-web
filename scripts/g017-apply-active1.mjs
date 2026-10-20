#!/usr/bin/env node
// =============================================================================
// G017 — 기존 활성 마무리 반영 (G015 스크립트를 복제하고 정답 바꾸기 · 다시 활성 · 질문 줄이기를 더함)
//   part a = V018 난이도 1 fix 98 · h = 힌트 52(V019 fix 41 + V018 새 힌트 fix 11 · scripts/g017-apply-hints.mjs 가 이 part 로 부른다)
//        c = 정리(CV-55 쌍 · #2051 공력가열 · #940 · #1035 다시 활성 · A79 긴 질문 3)
//   입력  data/pipeline/audit/g017-decisions.json  items[id] = { part, vround, before:{question_text,explanation,general_hint,variants,display_answer,is_active},
//                                                    question_text?, explanation?, general_hint?(null = 비움), display_answer?(대표 정답 바꾸기), activate?(true = 다시 활성),
//                                                    hintSources?, hintGen?, add?:[], remove?:[], deactivate?: 사유, skip?: 사유, why, sources?, notTaken?:[] }
//   출력  data/pipeline/audit/g017-fixes.json  parts[part] = { rows (id · field · before · after · why · sources) · notTaken · skipped }
//   사용  node scripts/g017-apply-active1.mjs --part a [--batch 1] [--apply]   (part: a · h · c · all — all 은 확인만)
//   ★ 기본은 확인만(--apply) · part 하나를 한 트랜잭션으로 · 대상 행의 지금 값이 before 와 같을 때만 쓴다(after 와 같으면 이미 됨 — 멱등 · 다르면 건너뛰고 목록)
//   ★ 반영 뒤 모습으로 검사: checkAnswerSet(막힘 0 · 정규화 중복 · 게이트가 떨어뜨리는 변형은 넣지 않음) · blankCheck · checkHint(막힘 0) · 힌트 120자 · 질문 200자
//   ★ 쓰는 칸: question_text · explanation · general_hint(+version hint-v5 · 비우면 둘 다 null) · display_answer(+대표 정답 행 answer_text · answer_norm)
//             · question_answers 비대표 행 넣기 · 빼기 · is_active(false + inactive_reason / true + inactive_reason null)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const APPLY = process.argv.includes('--apply');
const PART = process.argv[process.argv.indexOf('--part') + 1];
if (!['a', 'h', 'c', 'all'].includes(PART)) { console.error('--part a|h|c|all'); process.exit(2); }
if (APPLY && PART === 'all') { console.error('--apply 는 part 하나씩'); process.exit(2); }
const BATCH = process.argv.includes('--batch') ? Number(process.argv[process.argv.indexOf('--batch') + 1]) : null;
const KEY = BATCH ? `${PART}-${BATCH}` : PART;
const DEC = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g017-decisions.json'), 'utf8')).items;
const OUT = path.join(ROOT, 'data/pipeline/audit/g017-fixes.json');
const A5 = (v) => /[^\p{L}\p{N} ]/u.test(v);
const TEXT_COLS = ['question_text', 'explanation', 'general_hint'];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  let sel = Object.entries(DEC).filter(([, d]) => PART === 'all' || d.part === PART).sort((x, y) => Number(x[0]) - Number(y[0]));
  if (BATCH) sel = sel.slice((BATCH - 1) * 100, BATCH * 100);
  const ids = sel.map(([id]) => Number(id));
  const { rows: db } = await c.query(`select q.id, q.is_active, q.inactive_reason, q.question_text, q.display_answer, q.explanation, q.general_hint,
    coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
    from questions q where q.id = any($1::bigint[])`, [ids]);
  const D = new Map(db.map((r) => [Number(r.id), r]));
  const rows = []; const notTaken = []; const skipped = []; const problems = []; const todo = []; const deact = []; let done = 0;
  for (const [sid, d] of sel) {
    const id = Number(sid); const cur = D.get(id); if (!cur) { problems.push(`${id}: 없음`); continue; }
    if (d.skip) { skipped.push(`${id}: ${d.skip}`); continue; }
    for (const n of d.notTaken ?? []) notTaken.push({ id, ...n });
    const reason = d.deactivate ? `${d.vround} ${id} — ${d.deactivate}` : null;
    // 다시 활성 · 비활성 대상이 아닌데 비활성이면 건너뜀
    if (!cur.is_active && !d.activate && !(d.deactivate && cur.inactive_reason === reason)) { skipped.push(`${id}: 활성 아님 — 건너뜀`); continue; }
    const after = { question_text: cur.question_text, explanation: cur.explanation, general_hint: cur.general_hint, display_answer: cur.display_answer, variants: [...cur.variants] };
    const t = [];
    for (const col of [...TEXT_COLS, 'display_answer']) {
      if (d[col] === undefined) continue;
      rows.push({ id, field: col, before: d.before[col], after: d[col], why: d.why, sources: col === 'general_hint' ? (d.hintSources ?? null) : (d.sources ?? null), ...(col === 'general_hint' && d.hintGen ? { gen: true } : {}) });
      if (cur[col] === d[col]) { done++; after[col] = d[col]; continue; }
      if (cur[col] !== d.before[col]) { skipped.push(`${id} ${col}: DB 값이 before 와 다름 — 건너뜀`); continue; }
      after[col] = d[col]; t.push({ col, before: cur[col], after: d[col] });
    }
    // 변형 — 넣기 · 빼기 (A5 · 정규화 중복 · 게이트가 떨어뜨리는 것은 넣지 않음)
    const add = []; const dropped = [];
    for (const v of d.add ?? []) {
      if (A5(v)) { dropped.push({ answer: v, why: '15 A5 — 특수문자' }); continue; }
      if (after.variants.includes(v)) { done++; if (!d.before.variants.includes(v)) rows.push({ id, field: 'question_answers', before: null, after: v, why: d.why, sources: d.sources ?? null }); continue; }
      add.push(v);
    }
    const keep = after.variants.filter((v) => !(d.remove ?? []).includes(v));
    const g = checkAnswerSet(after.question_text, after.display_answer, [...keep, ...add], normalizeAnswer);
    for (const x of g.dropped) if (add.includes(x.answer)) dropped.push({ answer: x.answer, why: `게이트 ${x.kind} — ${x.why}` });
    const finalAdd = add.filter((v) => !g.dropped.some((x) => x.answer === v));
    const remove = (d.remove ?? []).filter((v) => after.variants.includes(v));
    for (const v of d.remove ?? []) if (!after.variants.includes(v) && d.before.variants.includes(v)) { done++; rows.push({ id, field: 'question_answers', before: v, after: null, why: d.why, sources: d.sources ?? null }); }
    after.variants = [...keep, ...finalAdd];
    for (const v of remove) rows.push({ id, field: 'question_answers', before: v, after: null, why: d.why, sources: d.sources ?? null });
    for (const v of finalAdd) rows.push({ id, field: 'question_answers', before: null, after: v, why: d.why, sources: d.sources ?? null });
    for (const x of dropped) notTaken.push({ id, field: 'variants', proposal: [x.answer], why: `넣지 않음 — ${x.why}` });
    // 활성 바꾸기
    let act = null;
    if (d.activate) { rows.push({ id, field: 'is_active', before: false, after: true, why: d.why, sources: d.sources ?? null }); if (cur.is_active) done++; else act = { to: true }; }
    if (reason) { rows.push({ id, field: 'is_active', before: true, after: false, why: reason, sources: d.sources ?? null }); if (!cur.is_active) done++; else act = { to: false, reason }; }
    // 반영 뒤 모습 검사
    if (!blankCheck(after.question_text, after.display_answer).ok) problems.push(`${id}: 빈칸 수`);
    if ([...after.question_text].length > 200) problems.push(`${id}: 질문 200자 초과`);
    const g2 = checkAnswerSet(after.question_text, after.display_answer, after.variants, normalizeAnswer);
    if (g2.blocked.length) problems.push(`${id}: 정답 묶음 막힘 ${JSON.stringify(g2.blocked)}`);
    if (after.general_hint) {
      if ([...after.general_hint].length > 120) problems.push(`${id}: 힌트 120자 초과`);
      const k = checkHint({ hint: after.general_hint, answer: after.display_answer, variants: after.variants, question: after.question_text, explanation: after.explanation ?? '' });
      if (k.block.length) problems.push(`${id}: checkHint 막힘 ${JSON.stringify(k.block)}`);
      if (k.warn.length) console.log(`  (힌트 경고) ${id}: ${JSON.stringify(k.warn)}`);
    }
    if (t.length || finalAdd.length || remove.length) todo.push({ id, t, add: finalAdd, remove, display: after.display_answer });
    if (act) deact.push({ id, ...act });
  }
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { round: 'G017', note: '', parts: {} };
  prev.note = 'G017 반영 — part a(V018 난이도 1 fix 98) · h(힌트 52) · c(정리) 마다 누적. 되돌리기는 rows[].before (question_answers 는 after 행 지우기 · before 행 되살리기 · is_active 는 반대로 · display_answer 는 대표 정답 행도 함께 · general_hint 를 되살릴 때 version 은 이전 값) · notTaken 은 받지 않은 제안과 사유 · gen 은 GEN 이 쓴(또는 비운) 힌트';
  if (PART !== 'all') prev.parts[KEY] = { counts: { decisions: ids.length, todo: todo.length, active: deact.length, done, skipped: skipped.length, rows: rows.length, notTaken: notTaken.length }, skipped, rows, notTaken };
  console.log(`[g017 ${KEY}] 결정 ${ids.length} · 할 일 ${todo.length} · 활성 바꿈 ${deact.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length} · rows ${rows.length} · notTaken ${notTaken.length}`);
  for (const s of skipped) console.log('  ', s);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (PART !== 'all') writeFileSync(OUT, JSON.stringify(prev, null, 1) + '\n');
  if (!APPLY || (!todo.length && !deact.length)) { console.log(APPLY ? `[g017 ${KEY}] 할 일 0` : `[g017 ${KEY}] 확인만 했다 — 쓰려면 --apply`); process.exit(0); }
  await c.query('begin');
  let n = 0; let want = 0;
  for (const r of todo) {
    for (const x of r.t) {
      want++;
      if (x.col === 'general_hint') n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and general_hint is not distinct from $4', [r.id, x.after, x.after == null ? null : 'hint-v5', x.before])).rowCount;
      else if (x.col === 'display_answer') {
        n += (await c.query('update questions set display_answer=$2, updated_at=now() where id=$1 and display_answer=$3', [r.id, x.after, x.before])).rowCount;
        want++; n += (await c.query('update question_answers set answer_text=$2, answer_norm=$3, note=$4 where question_id=$1 and is_primary and answer_text=$5', [r.id, x.after, normalizeAnswer(x.after), `G017 대표 정답 바꿈(전 ${x.before})`, x.before])).rowCount;
      } else n += (await c.query(`update questions set ${x.col}=$2, updated_at=now() where id=$1 and ${x.col} is not distinct from $3`, [r.id, x.after, x.before])).rowCount;
    }
    for (const a of r.remove ?? []) { want++; n += (await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary', [r.id, a])).rowCount; }
    for (const a of r.add) { want++; n += (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [r.id, a, normalizeAnswer(a), `G017 ${DEC[r.id].vround} 변형 추가`])).rowCount; }
  }
  for (const x of deact) {
    want++;
    if (x.to) n += (await c.query('update questions set is_active=true, inactive_reason=null, updated_at=now() where id=$1 and not is_active', [x.id])).rowCount;
    else n += (await c.query('update questions set is_active=false, inactive_reason=$2, updated_at=now() where id=$1 and is_active', [x.id, x.reason])).rowCount;
  }
  if (n !== want) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${want} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[g017 ${KEY}] 썼다 — ${n}행`);
} finally { await c.end(); }
