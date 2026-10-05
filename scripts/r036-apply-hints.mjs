#!/usr/bin/env node
// =============================================================================
// R036 — 중(난이도 3) 활성 문항에 일반 힌트를 쓴다 (기준서 4-1 H0 "3~5 에는 반드시")
//
//   data/pipeline/audit/r036-mid-hints.json   { hints: [{ id, answer, question, hint, path, sure, why }] }
//     → questions.general_hint · general_hint_version 'hint-v3'
//
// ★ 안전장치 (R029 · R030 과 같다)
//   · 기본은 확인만 한다 (--apply 를 줘야 쓴다). 한 트랜잭션 — 하나라도 어긋나면 전부 되돌린다
//   · DB 의 힌트가 **비어 있을 때만** 쓴다 (이미 같은 힌트면 건너뛴다 — 다시 돌려도 된다. 다른 힌트가 있으면 멈춘다)
//   · 기록의 질문이 DB 질문과 같아야 한다 (그사이 질문이 바뀌었으면 멈춘다)
//   · DB 의 질문·정답·변형·해설로 hint-check 를 다시 돌린다. 막힘이 하나라도 있으면 멈춘다 · 120자 초과 멈춘다
//   · 쓴 뒤 활성 난이도 3~5 에 힌트 빈 칸이 남으면 보고한다 (기록에 없는 것 = 이번에 못 붙인 것)
//
// 사용법
//   node scripts/r036-apply-hints.mjs            확인만
//   node scripts/r036-apply-hints.mjs --apply    쓴다
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
const HINT_VERSION = 'hint-v3';

const F = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/r036-mid-hints.json'), 'utf8'));
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query(
    `select q.id, q.question_text, q.display_answer, q.explanation, q.difficulty_score, q.is_active, q.general_hint,
            coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and x.answer_text <> q.display_answer), '{}') as variants
       from questions q where q.id = any($1::bigint[])`, [F.hints.map((h) => h.id)]);
  const db = new Map(rows.map((r) => [Number(r.id), r]));
  const problems = [], warns = [], todo = [];
  for (const h of F.hints) {
    const d = db.get(h.id);
    if (!d) { problems.push(`${h.id}: DB 에 없다`); continue; }
    if (!h.hint) continue; // 못 붙인 것 — 보고 목록
    if (d.general_hint === h.hint) continue;
    if (d.general_hint) { problems.push(`${h.id}: 이미 다른 힌트가 있다`); continue; }
    if (d.question_text !== h.question) { problems.push(`${h.id}: 기록의 질문이 DB 와 다르다 (그사이 바뀜)`); continue; }
    if (!d.is_active || d.difficulty_score !== 3) warns.push(`${h.id}: 활성 난이도 3 이 아니다 (활성 ${d.is_active} · ${d.difficulty_score})`);
    if (h.hint.length > 120) problems.push(`${h.id}: 120자 초과`);
    const c = checkHint({ hint: h.hint, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation ?? '' });
    if (c.block.length) problems.push(`${h.id}: hint-check 막힘 ${JSON.stringify(c.block)}`);
    if (c.warn.length) warns.push(`${h.id}: hint-check 경고 ${JSON.stringify(c.warn)}`);
    todo.push(h);
  }
  console.log(`[r036] 할 일 — 힌트 ${todo.length}/${F.hints.length} (빈 것 ${F.hints.filter((h) => !h.hint).length})`);
  for (const w of warns) console.log('  (경고)', w);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[r036] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }

  await client.query('begin');
  let n = 0;
  for (const h of todo) n += (await client.query(
    `update questions set general_hint = $2, general_hint_version = $3, updated_at = now() where id = $1 and general_hint is null`, [h.id, h.hint, HINT_VERSION])).rowCount;
  if (n !== todo.length) { await client.query('rollback'); console.error(`★ 쓴 수 ${n} ≠ 할 일 ${todo.length} — 되돌렸다`); process.exit(1); }
  await client.query('commit');
  const { rows: left } = await client.query(`select difficulty_score d, count(*)::int n from questions where is_active and difficulty_score >= 3 and general_hint is null group by 1 order by 1`);
  console.log(`[r036] 썼다 — 힌트 ${n} · 활성 3~5 힌트 빈 칸 ${JSON.stringify(left)}`);
} finally {
  await client.end();
}
