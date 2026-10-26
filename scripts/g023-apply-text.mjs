#!/usr/bin/env node
// =============================================================================
// G023 C — 읽기 고친 문장 적용(CV-94 · CV-99 (a) + CV-108 · 브리핑 C ①~⑦ — 판정·기계 검사는 g023-plan 이 했다)
//   입력  audit/g023-plan.json items[id].read{action apply/fixText · text · before}
//   출력  audit/g023-undo-text.json (id → 옛 question_text) · 건너뜀은 g023-text-skipped.json(계획) + 여기서 늘어난 것(live)
//   사용  node scripts/g023-apply-text.mjs [--dry-run | --apply | --undo [--ids 1,2,3]]
//   ★ 지금 DB 문구가 before 와 같을 때만 쓴다(after 와 같으면 이미 됨 — 멱등) · 쓰기 직전 다시 기계 검사(200자 · 빈칸 · 정답 낱말 노출)
// =============================================================================
import { connect, guardNoOpenGames, activeCount, loadPlan, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck, QUESTION_MAX } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const UNDO = 'g023-undo-text.json';
const ONLY = (() => { const i = process.argv.indexOf('--ids'); return i > 0 ? new Set(process.argv[i + 1].split(',')) : null; })();
const plan = loadPlan();
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); await guardNoOpenGames(c, 'g023 C undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) { if (ONLY && !ONLY.has(id)) continue; n += (await c.query('update questions set question_text=$2, updated_at=now() where id=$1 and question_text=$3', [id, o.before, o.after])).rowCount; }
    await c.query('commit'); console.log(`[g023 C] 되돌렸다 ${n}행${ONLY ? ` (--ids ${ONLY.size})` : ''}`); process.exit(0);
  }
  const sel = Object.entries(plan.items).filter(([, it]) => it.read && it.read.action !== 'skip');
  const { rows } = await c.query(`select q.id, q.question_text, q.display_answer, coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants
      from questions q where q.is_active and q.id = any($1::bigint[])`, [sel.map(([id]) => id)]);
  const DB = new Map(rows.map((r) => [String(r.id), r]));
  const todo = []; const skipped = []; let done = 0; const by = {};
  for (const [id, it] of sel) {
    const r = DB.get(id); const t = it.read.text;
    if (!r) { skipped.push({ id: +id, reason: '활성 아님' }); continue; }
    if (r.question_text === t) { done++; continue; }
    if (r.question_text !== it.read.before) { skipped.push({ id: +id, reason: 'DB 문구가 계획 때와 다름' }); continue; }
    const g = checkAnswerSet(t, r.display_answer, r.variants, normalizeAnswer);
    if (len(t) > QUESTION_MAX) { skipped.push({ id: +id, reason: `${len(t)}자` }); continue; }
    if (!blankCheck(t, r.display_answer).ok) { skipped.push({ id: +id, reason: '빈칸 수' }); continue; }
    if (g.blocked.length && !checkAnswerSet(r.question_text, r.display_answer, r.variants, normalizeAnswer).blocked.length) { skipped.push({ id: +id, reason: `정답 낱말 노출 ${g.blocked.map((b) => b.answer)}` }); continue; }
    const k = `${it.read.from} ${it.read.grade} ${it.read.action}`; by[k] = (by[k] ?? 0) + 1;
    todo.push({ id, before: r.question_text, after: t, from: it.read.from, grade: it.read.grade, action: it.read.action });
  }
  console.log(`[g023 C] 계획 ${sel.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 건너뜀(live) ${skipped.length}`);
  for (const [k, v] of Object.entries(by).sort()) console.log(`  ${k}: ${v}`);
  for (const s of skipped) console.log('  건너뜀', s.id, s.reason);
  if (MODE !== 'apply') { console.log('[g023 C] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g023 C');
  const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G023', step: 'C', note: '옛 질문 — node scripts/g023-apply-text.mjs --undo [--ids …]', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = { before: t.before, after: t.after, from: t.from, grade: t.grade, action: t.action };
  undo.writtenAt = at; undo.liveSkipped = skipped; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query('update questions set question_text=$2, updated_at=now() where id=$1 and question_text=$3', [t.id, t.after, t.before])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[g023 C] 썼다 ${n}행 · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end(); }
