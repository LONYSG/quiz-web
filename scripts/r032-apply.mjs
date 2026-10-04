#!/usr/bin/env node
// =============================================================================
// R032 — 기존 활성 문항 품질 정리(생성 없음)를 DB 에 쓴다
//
//   data/pipeline/audit/r032-fixes.json
//     edits       { id, before: { question?, explanation? }, after: { question?, explanation? }, src }
//                 questions.question_text / questions.explanation
//     variants    { id, add }               question_answers 에 같은 뜻의 답 추가 (고친 질문에 새로 맞는 답)
//     deactivate  { id, question, reason }  questions.is_active = false + inactive_reason
//
// ★ 안전장치 (R029 · R030 과 같다)
//   · 기본은 확인만 한다 (--apply 를 줘야 쓴다). 한 트랜잭션 — 하나라도 어긋나면 전부 되돌린다
//   · DB 의 지금 문구가 before 와 **똑같을 때만** 바꾼다 (이미 after 면 건너뛴다 — 다시 돌려도 된다)
//   · 바뀐 질문에 정답·변형이 새로 드러나지 않는가(findAnswerInQuestion) · 빈칸 수 = 정답 글자 수(blankCheck)
//   · 바뀐 질문 기준으로 기존 일반 힌트를 hint-check 로 다시 본다 (난이도 4~5 — 힌트가 질문과 겹치지 않는가). 막힘이면 멈춘다
//   · 바뀐 글의 단정어(assertiveWords)는 경고로 보여 준다 — 웹 확인을 거친 표현인지 사람이 본다
//   · 쓴 뒤 활성 난이도 4~5 에 힌트 빈 칸이 남으면 되돌린다
//
// 사용법
//   node scripts/r032-apply.mjs            확인만
//   node scripts/r032-apply.mjs --apply    쓴다
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck, assertiveWords } from '../pipeline/lib/question-checks.mjs';
import { checkHint } from './hint-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const APPLY = process.argv.includes('--apply');

const F = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/r032-fixes.json'), 'utf8'));
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const ids = [...new Set([...F.edits, ...F.variants, ...F.deactivate].map((x) => x.id))];
  const { rows } = await client.query(
    `select q.id, q.question_text, q.display_answer, q.explanation, q.difficulty_score, q.is_active, q.general_hint,
            coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and x.answer_text <> q.display_answer), '{}') as variants
       from questions q where q.id = any($1::bigint[])`, [ids]);
  const db = new Map(rows.map((r) => [Number(r.id), r]));
  const problems = [], warns = [];
  const todo = { edits: [], variants: [], deactivate: [] };
  const newQ = new Map(F.edits.filter((e) => e.after.question).map((e) => [e.id, e.after.question]));

  for (const e of F.edits) {
    const d = db.get(e.id);
    if (!d) { problems.push(`${e.id}: DB 에 없다`); continue; }
    if (!d.is_active) { problems.push(`${e.id}: 비활성 문항이다`); continue; }
    const cur = { question: d.question_text, explanation: d.explanation };
    const fields = Object.keys(e.after);
    if (fields.every((f) => cur[f] === e.after[f])) continue;
    if (fields.some((f) => cur[f] !== e.before[f])) { problems.push(`${e.id}: DB 문구가 before 와 다르다 (그사이 바뀜)`); continue; }
    const q = e.after.question ?? d.question_text;
    if (e.after.question) {
      for (const a of [d.display_answer, ...d.variants]) {
        const k = findAnswerInQuestion(q, a);
        if (k !== 'none' && findAnswerInQuestion(d.question_text, a) === 'none') problems.push(`${e.id}: 정답 "${a}" 가 새로 드러난다 (${k})`);
      }
      const b = blankCheck(q, d.display_answer);
      if (!b.ok) problems.push(`${e.id}: 빈칸 ${b.blanks}칸 ≠ 정답 ${b.answerLength}글자`);
      if (d.general_hint) {
        const c = checkHint({ hint: d.general_hint, answer: d.display_answer, variants: d.variants, question: q, explanation: e.after.explanation ?? d.explanation ?? '' });
        if (c.block.length) problems.push(`${e.id}: 바뀐 질문 기준으로 기존 힌트가 막힌다 ${JSON.stringify(c.block)}`);
      }
    }
    if (e.after.explanation !== undefined && !e.after.explanation) problems.push(`${e.id}: 해설이 비었다`);
    for (const f of fields) {
      const w = assertiveWords(e.after[f]);
      if (w.length) warns.push(`${e.id} ${f}: 단정어 ${w.flatMap((x) => x.words).join("·")} — ${e.src}`);
    }
    todo.edits.push(e);
  }
  for (const v of F.variants) {
    const d = db.get(v.id);
    if (!d) { problems.push(`변형 ${v.id}: DB 에 없다`); continue; }
    if ([d.display_answer, ...d.variants].some((x) => normalizeAnswer(x) === normalizeAnswer(v.add))) continue;
    if (findAnswerInQuestion(newQ.get(v.id) ?? d.question_text, v.add) !== 'none') problems.push(`변형 ${v.id}: "${v.add}" 가 질문에 드러난다`);
    todo.variants.push(v);
  }
  for (const x of F.deactivate) {
    const d = db.get(x.id);
    if (!d) { problems.push(`내림 ${x.id}: DB 에 없다`); continue; }
    if (!d.is_active) continue;
    if (d.question_text !== x.question) { problems.push(`내림 ${x.id}: DB 문구가 기록과 다르다`); continue; }
    todo.deactivate.push(x);
  }
  console.log(`[r032] 할 일 — 고침 ${todo.edits.length}/${F.edits.length} · 변형 ${todo.variants.length}/${F.variants.length} · 내림 ${todo.deactivate.length}/${F.deactivate.length}`);
  for (const w of warns) console.log('  (경고)', w);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[r032] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }

  await client.query('begin');
  const n = { q: 0, e: 0, v: 0, d: 0 };
  for (const e of todo.edits) {
    if (e.after.question !== undefined) n.q += (await client.query(`update questions set question_text = $2, updated_at = now() where id = $1 and question_text = $3`, [e.id, e.after.question, e.before.question])).rowCount;
    if (e.after.explanation !== undefined) n.e += (await client.query(`update questions set explanation = $2, updated_at = now() where id = $1 and explanation is not distinct from $3`, [e.id, e.after.explanation, e.before.explanation])).rowCount;
  }
  for (const v of todo.variants) n.v += (await client.query(
    `insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1, $2, $3, false, $4) on conflict do nothing`,
    [v.id, v.add, normalizeAnswer(v.add), 'R032 한정어 정리 — 같은 뜻의 답'])).rowCount;
  for (const x of todo.deactivate) n.d += (await client.query(`update questions set is_active = false, inactive_reason = $2, updated_at = now() where id = $1 and is_active`, [x.id, x.reason])).rowCount;
  const { rows: [{ n: left }] } = await client.query(`select count(*)::int n from questions where is_active and difficulty_score >= 4 and general_hint is null`);
  if (left !== 0) { await client.query('rollback'); console.error(`★ 난이도 4~5 에 힌트 없는 문항이 ${left}건 남는다 — 되돌렸다`); process.exit(1); }
  await client.query('commit');
  console.log(`[r032] 썼다 — 질문 ${n.q} · 해설 ${n.e} · 변형 ${n.v} · 내림 ${n.d} · 난이도 4~5 힌트 빈 칸 0`);
} finally {
  await client.end();
}
