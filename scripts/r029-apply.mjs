#!/usr/bin/env node
// =============================================================================
// R029 — 질문 다듬기 + 일반 힌트 소급을 DB 에 쓴다
//
//   data/pipeline/audit/r029-question-rewrite.json   questions.question_text  (before → after)
//   data/pipeline/audit/r029-general-hints.json      questions.general_hint / general_hint_version
//
// ★ 안전장치
//   · 기본은 확인만 한다 (--apply 를 줘야 쓴다). 한 트랜잭션 — 하나라도 어긋나면 전부 되돌린다.
//   · 질문은 DB 의 지금 문장이 before 와 **똑같을 때만** 바꾼다 (그사이 누가 고쳤으면 멈춘다).
//   · 힌트는 비어 있을 때만 채운다. 이미 같은 힌트가 있으면 건너뛴다 (다시 돌려도 된다).
//   · 쓰기 전에 hint-check 를 **바뀐 질문 기준으로** 다시 돌린다. 막힘이 하나라도 있으면 멈춘다.
//
// 사용법
//   node scripts/r029-apply.mjs            확인만
//   node scripts/r029-apply.mjs --apply    쓴다
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const APPLY = process.argv.includes('--apply');
const HINT_VERSION = 'hint-v2';

const rw = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/r029-question-rewrite.json'), 'utf8')).items;
const hints = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/r029-general-hints.json'), 'utf8')).items;

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const ids = [...new Set([...rw.map((r) => r.id), ...hints.map((h) => h.id)])];
  const { rows } = await client.query(
    `select q.id, q.question_text, q.display_answer, q.explanation, q.difficulty_score, q.is_active, q.general_hint,
            coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and x.answer_text <> q.display_answer), '{}') as variants
       from questions q where q.id = any($1::bigint[])`, [ids]);
  const db = new Map(rows.map((r) => [Number(r.id), r]));
  const problems = [];
  for (const r of rw) {
    const d = db.get(r.id);
    if (!d) problems.push(`질문 ${r.id}: DB 에 없다`);
    else if (!d.is_active) problems.push(`질문 ${r.id}: 비활성`);
    else if (d.question_text !== r.before && d.question_text !== r.after) problems.push(`질문 ${r.id}: DB 문장이 before 와 다르다 (그사이 바뀜)`);
  }
  const after = new Map(rw.map((r) => [r.id, r.after]));
  let hintTodo = 0, hintSame = 0;
  for (const h of hints) {
    const d = db.get(h.id);
    if (!d) { problems.push(`힌트 ${h.id}: DB 에 없다`); continue; }
    if (!(d.difficulty_score >= 4)) problems.push(`힌트 ${h.id}: 난이도 ${d.difficulty_score} — 4~5 가 아니다`);
    if (!h.hint || h.hint.length > 120) problems.push(`힌트 ${h.id}: 비었거나 120자 초과`);
    const c = checkHint({ hint: h.hint, answer: d.display_answer, variants: d.variants, question: after.get(h.id) ?? d.question_text, explanation: d.explanation ?? '' });
    if (c.block.length) problems.push(`힌트 ${h.id}: hint-check 막힘 ${JSON.stringify(c.block)}`);
    if (d.general_hint === h.hint) hintSame++;
    else if (d.general_hint) problems.push(`힌트 ${h.id}: 이미 다른 힌트가 있다`);
    else hintTodo++;
  }
  const { rows: [{ n: need }] } = await client.query(`select count(*)::int n from questions where is_active and difficulty_score >= 4`);
  console.log(`[r029] 질문 다듬기 ${rw.length}건 · 힌트 ${hints.length}건 (새로 ${hintTodo} / 이미 같음 ${hintSame}) · 활성 난이도 4~5 = ${need}`);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[r029] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }

  await client.query('begin');
  let q = 0, h = 0;
  for (const r of rw) q += (await client.query(`update questions set question_text = $2, updated_at = now() where id = $1 and question_text = $3`, [r.id, r.after, r.before])).rowCount;
  for (const x of hints) h += (await client.query(`update questions set general_hint = $2, general_hint_version = $3, updated_at = now() where id = $1 and general_hint is null`, [x.id, x.hint, HINT_VERSION])).rowCount;
  const { rows: [{ n: left }] } = await client.query(`select count(*)::int n from questions where is_active and difficulty_score >= 4 and general_hint is null`);
  if (left !== 0) { await client.query('rollback'); console.error(`★ 난이도 4~5 에 힌트 없는 문항이 ${left}건 남는다 — 되돌렸다`); process.exit(1); }
  await client.query('commit');
  console.log(`[r029] 썼다 — 질문 ${q}건 · 힌트 ${h}건 · 난이도 4~5 힌트 빈 칸 0`);
} finally {
  await client.end();
}
