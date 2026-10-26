#!/usr/bin/env node
// =============================================================================
// G023 E — 사실 fix 6 (글귀 바꾸기 · 글자 그대로) — 목록은 g023-plan.json summary.fact (g023-plan.mjs FACT)
//   3439 실러캔스 질문 · 1334 대운하 힌트 · 4197 허당 질문('국민 ○○' → '○○ 승기') · 5806 CS 질문 · 6414 하버드 힌트 · 4457 우도 힌트
//   unverified(V027 3 · V028 5 · G022 5)는 고치지 않는다(13 CV-96 · CV-104 "확인 못 함 13 — 그대로")
//   출력  audit/g023-undo-fact.json (id → field · before · after)
//   사용  node scripts/g023-apply-fact.mjs [--dry-run | --apply | --undo]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, loadPlan, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';
import { checkHint } from './hint-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const UNDO = 'g023-undo-fact.json';
const FACT = loadPlan().summary.fact;
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); await guardNoOpenGames(c, 'g023 E undo'); await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query(`update questions set ${o.field}=$2, updated_at=now() where id=$1 and ${o.field}=$3`, [id, o.before, o.after])).rowCount;
    await c.query('commit'); console.log(`[g023 E] 되돌렸다 ${n}`); process.exit(0);
  }
  const todo = []; const problems = [];
  for (const f of FACT) {
    const { rows: [r] } = await c.query(`select q.*, coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants from questions q where id=$1 and is_active`, [f.id]);
    if (!r) { problems.push(`${f.id} 활성 아님`); continue; }
    const cur = r[f.field];
    if (cur.includes(f.to) && !cur.includes(f.from)) { console.log(`#${f.id} 이미 됨`); continue; }
    if (!cur.includes(f.from)) { problems.push(`${f.id} 글귀 없음 "${f.from}"`); continue; }
    const after = cur.replace(f.from, f.to);
    if (f.field === 'question_text') {
      if (len(after) > 200) problems.push(`${f.id} 200자 초과`);
      if (!blankCheck(after, r.display_answer).ok) problems.push(`${f.id} 빈칸`);
      if (checkAnswerSet(after, r.display_answer, r.variants, normalizeAnswer).blocked.length) problems.push(`${f.id} 정답 노출`);
    } else {
      if (len(after) > 120) problems.push(`${f.id} 힌트 120자 초과`);
      const k = checkHint({ hint: after, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' });
      if (k.block.length) problems.push(`${f.id} 힌트 막힘 ${JSON.stringify(k.block)}`);
    }
    todo.push({ id: f.id, field: f.field, before: cur, after, src: f.src });
    console.log(`#${f.id} ${r.display_answer} [${f.field}]\n   전: ${cur}\n   후: ${after}`);
  }
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (MODE !== 'apply') { console.log('[g023 E] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g023 E'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G023', step: 'E', note: '사실 fix 옛 값 — --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t;
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query(`update questions set ${t.field}=$2, updated_at=now() where id=$1 and ${t.field}=$3`, [t.id, t.after, t.before])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length}`); process.exit(1); }
  await c.query('commit'); console.log(`[g023 E] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end(); }
