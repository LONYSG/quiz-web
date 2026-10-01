#!/usr/bin/env node
// =============================================================================
// R030 — V003 반영(새 세기 기준) + 원문 결함 정리를 DB 에 쓴다
//
//   data/pipeline/audit/r030-fixes.json
//     hints       questions.general_hint (version 'hint-v3')
//     questions   questions.question_text
//     variants    question_answers 에 정답 변형 추가
//     deactivate  questions.is_active = false + inactive_reason
//
// ★ 안전장치 (R029 와 같다)
//   · 기본은 확인만 한다 (--apply 를 줘야 쓴다). 한 트랜잭션 — 하나라도 어긋나면 전부 되돌린다
//   · DB 의 지금 문구가 before 와 **똑같을 때만** 바꾼다 (이미 after 면 건너뛴다 — 다시 돌려도 된다)
//   · 바뀐 질문에 정답·변형이 새로 드러나지 않는지(findAnswerInQuestion) 본다
//   · 힌트는 **바뀐 뒤의 질문·변형 기준으로** hint-check 를 다시 돌린다. 막힘이 하나라도 있으면 멈춘다
//   · 쓴 뒤 활성 난이도 4~5 에 힌트 빈 칸이 남으면 되돌린다
//
// 사용법
//   node scripts/r030-apply.mjs            확인만
//   node scripts/r030-apply.mjs --apply    쓴다
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { checkHint } from './hint-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const APPLY = process.argv.includes('--apply');
const HINT_VERSION = 'hint-v3';

const F = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/r030-fixes.json'), 'utf8'));
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const ids = [...new Set([...F.hints, ...F.questions, ...F.variants, ...F.deactivate].map((x) => x.id))];
  const { rows } = await client.query(
    `select q.id, q.question_text, q.display_answer, q.explanation, q.difficulty_score, q.is_active, q.general_hint,
            coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and x.answer_text <> q.display_answer), '{}') as variants
       from questions q where q.id = any($1::bigint[])`, [ids]);
  const db = new Map(rows.map((r) => [Number(r.id), r]));
  const problems = [];
  const todo = { hints: [], questions: [], variants: [], deactivate: [] };
  const newQ = new Map(F.questions.map((q) => [q.id, q.after]));
  const newV = new Map(); for (const v of F.variants) newV.set(v.id, [...(newV.get(v.id) ?? []), v.add]);

  for (const q of F.questions) {
    const d = db.get(q.id);
    if (!d) { problems.push(`질문 ${q.id}: DB 에 없다`); continue; }
    if (d.question_text === q.after) continue;
    if (d.question_text !== q.before) { problems.push(`질문 ${q.id}: DB 문구가 before 와 다르다 (그사이 바뀜)`); continue; }
    for (const a of [d.display_answer, ...d.variants, ...(newV.get(q.id) ?? [])]) {
      const k = findAnswerInQuestion(q.after, a);
      if (k !== 'none' && findAnswerInQuestion(q.before, a) === 'none') problems.push(`질문 ${q.id}: 정답 "${a}" 가 새로 드러난다 (${k})`);
    }
    todo.questions.push(q);
  }
  for (const v of F.variants) {
    const d = db.get(v.id);
    if (!d) { problems.push(`변형 ${v.id}: DB 에 없다`); continue; }
    if (d.variants.some((x) => normalizeAnswer(x) === normalizeAnswer(v.add))) continue;
    const k = findAnswerInQuestion(newQ.get(v.id) ?? d.question_text, v.add);
    if (k === 'word') problems.push(`변형 ${v.id}: "${v.add}" 가 질문에 낱말로 들어 있다`);
    todo.variants.push(v);
  }
  for (const x of F.deactivate) {
    const d = db.get(x.id);
    if (!d) { problems.push(`내림 ${x.id}: DB 에 없다`); continue; }
    if (!d.is_active) continue;
    if (d.question_text !== x.question) { problems.push(`내림 ${x.id}: DB 문구가 기록과 다르다`); continue; }
    todo.deactivate.push(x);
  }
  for (const h of F.hints) {
    const d = db.get(h.id);
    if (!d) { problems.push(`힌트 ${h.id}: DB 에 없다`); continue; }
    if (d.general_hint === h.after) continue;
    if (d.general_hint !== h.before) { problems.push(`힌트 ${h.id}: DB 힌트가 before 와 다르다 (그사이 바뀜)`); continue; }
    if (!h.after || h.after.length > 120) problems.push(`힌트 ${h.id}: 비었거나 120자 초과`);
    const c = checkHint({ hint: h.after, answer: d.display_answer, variants: [...d.variants, ...(newV.get(h.id) ?? [])], question: newQ.get(h.id) ?? d.question_text, explanation: d.explanation ?? '' });
    if (c.block.length) problems.push(`힌트 ${h.id}: hint-check 막힘 ${JSON.stringify(c.block)}`);
    todo.hints.push(h);
  }
  // ★ 질문이 바뀐 문항의 **기존** 힌트도 바뀐 질문으로 다시 본다 (이번에 고치지 않는 힌트)
  for (const q of F.questions) {
    const d = db.get(q.id); if (!d?.general_hint || F.hints.some((h) => h.id === q.id)) continue;
    const c = checkHint({ hint: d.general_hint, answer: d.display_answer, variants: d.variants, question: q.after, explanation: d.explanation ?? '' });
    if (c.block.length) problems.push(`질문 ${q.id}: 바뀐 질문 기준으로 기존 힌트가 막힌다 ${JSON.stringify(c.block)}`);
  }
  console.log(`[r030] 할 일 — 힌트 ${todo.hints.length}/${F.hints.length} · 질문 ${todo.questions.length}/${F.questions.length} · 변형 ${todo.variants.length}/${F.variants.length} · 내림 ${todo.deactivate.length}/${F.deactivate.length}`);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[r030] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }

  await client.query('begin');
  let n = { h: 0, q: 0, v: 0, d: 0 };
  for (const q of todo.questions) n.q += (await client.query(`update questions set question_text = $2, updated_at = now() where id = $1 and question_text = $3`, [q.id, q.after, q.before])).rowCount;
  for (const v of todo.variants) n.v += (await client.query(
    `insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1, $2, $3, false, $4) on conflict do nothing`,
    [v.id, v.add, normalizeAnswer(v.add), 'R030 원문 결함 정리 — 같은 뜻의 답'])).rowCount;
  for (const x of todo.deactivate) n.d += (await client.query(`update questions set is_active = false, inactive_reason = $2, updated_at = now() where id = $1 and is_active`, [x.id, x.reason])).rowCount;
  for (const h of todo.hints) n.h += (await client.query(`update questions set general_hint = $2, general_hint_version = $3, updated_at = now() where id = $1 and general_hint = $4`, [h.id, h.after, HINT_VERSION, h.before])).rowCount;
  const { rows: [{ n: left }] } = await client.query(`select count(*)::int n from questions where is_active and difficulty_score >= 4 and general_hint is null`);
  if (left !== 0) { await client.query('rollback'); console.error(`★ 난이도 4~5 에 힌트 없는 문항이 ${left}건 남는다 — 되돌렸다`); process.exit(1); }
  await client.query('commit');
  console.log(`[r030] 썼다 — 힌트 ${n.h} · 질문 ${n.q} · 변형 ${n.v} · 내림 ${n.d} · 난이도 4~5 힌트 빈 칸 0`);
} finally {
  await client.end();
}
