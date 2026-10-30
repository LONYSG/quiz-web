#!/usr/bin/env node
// =============================================================================
// G025 C · D③ — 질문·해설 고침 14 (CV-111 유래 10 → 질문으로 · 알가치 3 / CV-112 1941 질문 / G023 이 200자로 건너뛴 3 → 240자 상한으로 적용)
//   입력  audit/g025-plan.json text[id]{before · after{question · explanation · src} · worth}
//   출력  audit/g025-undo-text.json (id → 옛 question_text · explanation · worth)
//   ★ 쓰기 직전 다시 기계 검사: QUESTION_MAX(240) · 빈칸 · 정답 낱말 노출(checkAnswerSet) — 하나라도 걸리면 그 문항은 건너뜀
//   ★ general_hint · question_answers · difficulty 는 건드리지 않는다(G026 몫) — 힌트 겹침은 checkHint 결과만 출력
//   사용  node scripts/g025-apply-text.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck, QUESTION_MAX } from '../pipeline/lib/question-checks.mjs';
import { checkHint } from './hint-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const UNDO = 'g025-undo-text.json';
const DRY = process.argv.includes('--dry-run');
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, 'g025 C undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) {
      n += (await c.query('update questions set question_text=$2, explanation=$3, worth=$4, updated_at=now() where id=$1 and question_text=$5 and explanation is not distinct from $6',
        [id, o.before.question, o.before.explanation, o.before.worth, o.after.question, o.after.explanation])).rowCount;
    }
    if (DRY) { await c.query('rollback'); console.log(`[g025 C undo] 확인만 — 옛 글로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); process.exit(0); }
    await c.query('commit'); console.log(`[g025 C] 되돌렸다 ${n}`); process.exit(0);
  }
  const plan = readJson('g025-plan.json');
  const ids = Object.keys(plan.text);
  const { rows } = await c.query(`select q.id, q.question_text, q.explanation, q.worth, q.display_answer, q.general_hint,
      coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants
      from questions q where q.is_active and q.id = any($1::bigint[])`, [ids]);
  const DB = new Map(rows.map((r) => [String(r.id), r]));
  const todo = []; const skipped = []; let done = 0;
  for (const id of ids) {
    const t = plan.text[id]; const r = DB.get(id); const q = t.after.question; const e = t.after.explanation;
    if (!r) { skipped.push({ id, reason: '활성 아님' }); continue; }
    if (r.question_text === q && r.explanation === e && r.worth === t.worth.after) { done++; continue; }
    if (r.question_text !== t.before.question || r.explanation !== t.before.explanation) { skipped.push({ id, reason: 'DB 글이 계획 때와 다름' }); continue; }
    if (len(q) > QUESTION_MAX) { skipped.push({ id, reason: `${len(q)}자 > ${QUESTION_MAX}` }); continue; }
    if (!blankCheck(q, r.display_answer).ok) { skipped.push({ id, reason: '빈칸 수' }); continue; }
    const g = checkAnswerSet(q, r.display_answer, r.variants, normalizeAnswer);
    if (g.blocked.length) { skipped.push({ id, reason: `정답 낱말 노출 ${g.blocked.map((b) => b.answer)}` }); continue; }
    const h = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants, question: q, explanation: e });
    todo.push({ id, answer: r.display_answer, kind: t.after.kind, before: { question: r.question_text, explanation: r.explanation, worth: r.worth }, after: { question: q, explanation: e, worth: t.worth.after }, src: t.after.src, hint: { block: h.block.length, warn: h.warn.map((w) => w.kind) } });
  }
  console.log(`[g025 C] 계획 ${ids.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
  for (const t of todo) console.log(`  ${t.id} ${t.answer} [${t.kind}] ${len(t.before.question)}→${len(t.after.question)}자 · 해설 ${t.before.explanation === t.after.explanation ? '그대로' : '고침'} · worth ${t.before.worth}→${t.after.worth} · 힌트 막힘 ${t.hint.block} 경고 ${t.hint.warn.join(',') || 0}`);
  for (const s of skipped) console.log('  건너뜀', s.id, s.reason);
  if (MODE !== 'apply') { console.log('[g025 C] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g025 C'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G025', step: 'C·D', note: '옛 질문·해설·worth — node scripts/g025-apply-text.mjs --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t;
  undo.writtenAt = at; undo.skipped = skipped; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) {
    n += (await c.query('update questions set question_text=$2, explanation=$3, worth=$4, updated_at=now() where id=$1 and question_text=$5 and explanation is not distinct from $6',
      [t.id, t.after.question, t.after.explanation, t.after.worth, t.before.question, t.before.explanation])).rowCount;
  }
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit'); console.log(`[g025 C] 썼다 ${n} · ${at} · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end().catch(() => {}); }
