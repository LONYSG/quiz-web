#!/usr/bin/env node
// =============================================================================
// G013 A — V015 판정(기존 활성 난이도 4·5 · fix 126)을 DB 활성 행에 반영 (CV-39 첫 덩어리 · C73 ② H2-21 · C2-18 힌트)
//   입력  data/pipeline/audit/g013-decisions.json  items[id] = { before:{question_text,explanation,general_hint,variants(비대표 정답 — 반영 전)}, question_text?, explanation?, general_hint?,
//                                                    hintSources?, add?:[], remove?:[], deactivate?: 사유, why, sources?, notTaken?:[] }
//         (GEN 이 fix 126 을 다 읽고 정한 값 + 제안 속 새 사실을 하위 에이전트가 문서로 다시 연 결과 — 받지 않은 제안은 notTaken)
//   출력  data/pipeline/audit/g013-fixes.json  rows (id · field · before · after · why · sources) · notTaken · deactivated
//   ★ 기본은 확인만(--apply) · 한 트랜잭션 · 대상 행의 지금 값이 before 와 같을 때만 쓴다(after 와 같으면 이미 됨 — 멱등 · 다르면 건너뛰고 목록)
//   ★ 반영 뒤 모습으로 검사: checkAnswerSet(막힘 0 · 정규화 중복 · A5 변형은 뺀다) · blankCheck · checkHint(막힘 0)
//   ★ 쓰는 칸: question_text · explanation · general_hint(+version hint-v5) · question_answers 비대표 행(넣기 · 빼기) · is_active=false + inactive_reason("V015 <id> — 사유")
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
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
const DEC = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g013-decisions.json'), 'utf8')).items;
const A5 = (v) => /[^\p{L}\p{N} ]/u.test(v);
const TEXT_COLS = ['question_text', 'explanation', 'general_hint'];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  const ids = Object.keys(DEC).map(Number);
  const { rows: db } = await c.query(`select q.id, q.is_active, q.inactive_reason, q.question_text, q.display_answer, q.explanation, q.general_hint,
    coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
    from questions q where q.id = any($1::bigint[])`, [ids]);
  const D = new Map(db.map((r) => [Number(r.id), r]));
  const rows = []; const notTaken = []; const skipped = []; const problems = []; const todo = []; const deact = []; let done = 0;
  for (const [sid, d] of Object.entries(DEC)) {
    const id = Number(sid); const cur = D.get(id); if (!cur) { problems.push(`${id}: 없음`); continue; }
    for (const n of d.notTaken ?? []) notTaken.push({ id, ...n });
    if (d.deactivate) {
      const reason = `V015 ${id} — ${d.deactivate}`;
      rows.push({ id, field: 'is_active', before: true, after: false, why: reason, sources: d.sources ?? null });
      if (!cur.is_active && cur.inactive_reason === reason) { done++; continue; }
      if (!cur.is_active) { skipped.push(`${id}: 이미 비활성(다른 사유)`); continue; }
      deact.push({ id, reason }); continue;
    }
    if (!cur.is_active) { skipped.push(`${id}: 활성 아님 — 건너뜀`); continue; }
    const after = { question_text: cur.question_text, explanation: cur.explanation, general_hint: cur.general_hint, variants: [...cur.variants] };
    const t = [];
    for (const col of TEXT_COLS) {
      if (d[col] === undefined) continue;
      rows.push({ id, field: col, before: d.before[col], after: d[col], why: d.why, sources: col === 'general_hint' ? (d.hintSources ?? null) : (d.sources ?? null) });
      if (cur[col] === d[col]) { done++; after[col] = d[col]; continue; }
      if (cur[col] !== d.before[col]) { skipped.push(`${id} ${col}: DB 값이 before 와 다름 — 건너뜀`); continue; }
      after[col] = d[col]; t.push({ col, before: d.before[col], after: d[col] });
    }
    // 변형 — 넣기 · 빼기 (A5 · 정규화 중복 · 게이트가 떨어뜨리는 것은 넣지 않음)
    const add = []; const dropped = [];
    for (const v of d.add ?? []) {
      if (A5(v)) { dropped.push({ answer: v, why: '15 A5 — 특수문자' }); continue; }
      if (after.variants.includes(v)) { done++; if (d.before.variants && !d.before.variants.includes(v)) rows.push({ id, field: 'question_answers', before: null, after: v, why: d.why, sources: d.sources ?? null }); continue; }
      add.push(v);
    }
    const remove = (d.remove ?? []).filter((v) => after.variants.includes(v));
    const nextVars = [...after.variants.filter((v) => !remove.includes(v)), ...add];
    const g = checkAnswerSet(after.question_text, cur.display_answer, nextVars, normalizeAnswer);
    for (const x of g.dropped) dropped.push({ answer: x.answer, why: `게이트 ${x.kind} — ${x.why}` });
    const finalAdd = add.filter((v) => !g.dropped.some((x) => x.answer === v));
    after.variants = [...after.variants.filter((v) => !remove.includes(v)), ...finalAdd];
    for (const v of finalAdd) rows.push({ id, field: 'question_answers', before: null, after: v, why: d.why, sources: d.sources ?? null });
    for (const v of remove) rows.push({ id, field: 'question_answers', before: v, after: null, why: d.why, sources: d.sources ?? null });
    for (const x of dropped) notTaken.push({ id, field: 'variants', proposal: [x.answer], why: `넣지 않음 — ${x.why}` });
    // 반영 뒤 모습 검사
    if (!blankCheck(after.question_text, cur.display_answer).ok) problems.push(`${id}: 빈칸 수`);
    const g2 = checkAnswerSet(after.question_text, cur.display_answer, after.variants, normalizeAnswer);
    if (g2.blocked.length) problems.push(`${id}: 정답 묶음 막힘 ${JSON.stringify(g2.blocked)}`);
    if (after.general_hint) {
      if ([...after.general_hint].length > 120) problems.push(`${id}: 힌트 120자 초과`);
      const k = checkHint({ hint: after.general_hint, answer: cur.display_answer, variants: after.variants, question: after.question_text, explanation: after.explanation ?? '' });
      if (k.block.length) problems.push(`${id}: checkHint 막힘 ${JSON.stringify(k.block)}`);
      if (k.warn.length) console.log(`  (힌트 경고) ${id}: ${JSON.stringify(k.warn)}`);
    }
    if (t.length || finalAdd.length || remove.length) todo.push({ id, t, add: finalAdd, remove });
  }
  const out = { round: 'G013', note: 'A — V015 판정(활성 난이도 4·5 fix 126) 반영. 되돌리기는 rows[].before (question_answers 는 after 행 지우기 · before 행 되살리기 · is_active 는 true 로) · notTaken 은 받지 않은 제안과 사유', counts: { decisions: ids.length, todo: todo.length, deactivate: deact.length, done, skipped: skipped.length }, skipped, rows, notTaken };
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g013-fixes.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`[g013-a] 결정 ${ids.length} · 할 일 ${todo.length} · 비활성 ${deact.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length} · rows ${rows.length} · notTaken ${notTaken.length}`);
  for (const s of skipped) console.log('  ', s);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY || (!todo.length && !deact.length)) { console.log(APPLY ? '[g013-a] 할 일 0' : '[g013-a] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  await c.query('begin');
  let n = 0; let want = 0;
  for (const r of todo) {
    for (const x of r.t) {
      want++;
      if (x.col === 'general_hint') n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and is_active and general_hint is not distinct from $4', [r.id, x.after, 'hint-v5', x.before])).rowCount;
      else n += (await c.query(`update questions set ${x.col}=$2, updated_at=now() where id=$1 and is_active and ${x.col} is not distinct from $3`, [r.id, x.after, x.before])).rowCount;
    }
    for (const a of r.add) { want++; n += (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [r.id, a, normalizeAnswer(a), 'G013 V015 변형 추가'])).rowCount; }
    for (const a of r.remove) { want++; n += (await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary', [r.id, a])).rowCount; }
  }
  for (const x of deact) { want++; n += (await c.query('update questions set is_active=false, inactive_reason=$2, updated_at=now() where id=$1 and is_active', [x.id, x.reason])).rowCount; }
  if (n !== want) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${want} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[g013-a] 썼다 — ${n}행`);
} finally { await c.end(); }
