#!/usr/bin/env node
// =============================================================================
// G024 A — 계획표 audit/g024-plan.json (DB 읽기만 · 쓰기 전 전부 계산)
//   ① 힌트 대상  is_active ∧ difficulty_score ≥ 3 ∧ general_hint IS NULL (DB 가 정본 — g023-hintless.json 521 과 차이를 적는다)
//   ② H9 대상   g023-h9-pending 293 — 지금 힌트가 pending 의 hint 와 같은지(다르면 지금 힌트로 다시 판단)
//   ③ 분야      g023-category-pending 150
//   ④ 민감      5466 · 6813 · 6563 · 6686 (6686 은 ①②③ 에서 뺀다 — 비활성)
//   items[id] = { tasks[] · v2 · answer · variants · question · explanation · hint · hintVersion · category · sameAnswerActive[] · questionWords · h9note[] }
//   사용  node scripts/g024-plan.mjs
// =============================================================================
import { connect, readJson, writeJson } from './g023-common.mjs';
import { questionWords } from './hint-input.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const SENSITIVE = [5466, 6813, 6563, 6686];
const DEACTIVATE = 6686;
const c = await connect();
try {
  const { rows: Q } = await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.difficulty_score,
      q.category_id, q.is_active, a.answer_norm,
      coalesce((select array_agg(answer_text order by x.id) from question_answers x where x.question_id = q.id and not x.is_primary), '{}') variants
    from questions q join question_answers a on a.question_id = q.id and a.is_primary where q.is_active order by q.id`);
  const { rows: C } = await c.query('select id, key, name_ko, level, parent_id from categories');
  const cat = new Map(C.map((r) => [r.id, r]));
  const l1Of = (id) => { let r = cat.get(id); while (r && r.level > 1) r = cat.get(r.parent_id); return r ? (r.level === 1 ? r.name_ko : `옛 분야 ${r.name_ko}`) : '?'; };
  const catPath = (id) => { const p = []; let r = cat.get(id); while (r) { p.unshift(r.name_ko); r = cat.get(r.parent_id); } return p.join(' > '); };
  const byNorm = new Map();
  for (const r of Q) { if (!byNorm.has(r.answer_norm)) byNorm.set(r.answer_norm, []); byNorm.get(r.answer_norm).push(r); }
  const QM = new Map(Q.map((r) => [String(r.id), r]));

  const items = {};
  const add = (id, task) => {
    const r = QM.get(String(id)); if (!r) return false;
    if (!items[id]) {
      items[id] = {
        tasks: [], v2: r.difficulty_score, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation,
        hint: r.general_hint, hintVersion: r.general_hint_version, category: { id: r.category_id, path: catPath(r.category_id), level: cat.get(r.category_id)?.level }, l1: l1Of(r.category_id),
        questionWords: questionWords(r.question_text),
        sameAnswerActive: (byNorm.get(r.answer_norm) ?? []).filter((x) => x.id !== r.id && x.id !== String(DEACTIVATE) && Number(x.id) !== DEACTIVATE)
          .map((x) => ({ id: Number(x.id), v2: x.difficulty_score, question: x.question_text, explanation: x.explanation, hint: x.general_hint })),
      };
    }
    items[id].tasks.push(task); return true;
  };

  // ① 힌트
  const hintless = Q.filter((r) => r.difficulty_score >= 3 && r.general_hint == null && Number(r.id) !== DEACTIVATE);
  for (const r of hintless) add(r.id, 'hint');
  const list = readJson('g023-hintless.json').items.map((i) => String(i.id));
  const dbSet = new Set(Q.filter((r) => r.difficulty_score >= 3 && r.general_hint == null).map((r) => String(r.id)));
  const listNotDb = list.filter((x) => !dbSet.has(x)).map((x) => ({ id: Number(x), now: QM.get(x) ? { v2: QM.get(x).difficulty_score, hint: QM.get(x).general_hint } : '비활성' }));
  const dbNotList = [...dbSet].filter((x) => !list.includes(x));

  // ② H9
  const h9 = readJson('g023-h9-pending.json').items;
  const h9diff = []; const h9skip = [];
  for (const p of h9) {
    if (p.id === DEACTIVATE) { h9skip.push({ id: p.id, why: '6686 비활성' }); continue; }
    const r = QM.get(String(p.id)); if (!r) { h9skip.push({ id: p.id, why: '활성 아님' }); continue; }
    add(p.id, 'h9'); items[p.id].h9note = p.notes; items[p.id].h9judgedHint = p.hint;
    if (r.general_hint !== p.hint) { items[p.id].h9changed = true; h9diff.push({ id: p.id, judged: p.hint, now: r.general_hint }); }
  }

  // ③ 분야
  const cp = readJson('g023-category-pending.json').items; const catSkip = [];
  for (const p of cp) {
    if (p.id === DEACTIVATE) { catSkip.push(p.id); continue; }
    if (!add(p.id, 'category')) { catSkip.push(p.id); continue; }
    items[p.id].categoryTried = p.tried; items[p.id].categoryNow = p.now;
  }

  // ④ 민감
  for (const id of SENSITIVE) add(id, 'sensitive');

  // 같은 정답 무리 대조 (g023-lists sameAnswer 877)
  const groups = readJson('g023-lists.json').sameAnswer; const gOf = new Map();
  for (const g of groups) for (const id of g.ids) gOf.set(String(id), g.ids.map(String));
  let saMismatch = 0;
  for (const [id, it] of Object.entries(items)) {
    const mine = new Set(it.sameAnswerActive.map((x) => String(x.id)));
    const g = (gOf.get(id) ?? []).filter((x) => x !== id && x !== String(DEACTIVATE));
    if (g.length !== mine.size || g.some((x) => !mine.has(x))) saMismatch++;
  }

  const count = (task, key) => { const o = {}; for (const it of Object.values(items)) if (it.tasks.includes(task)) { const k = it[key]; o[k] = (o[k] ?? 0) + 1; } return o; };
  const summary = {
    hint: { n: hintless.length, byV2: count('hint', 'v2'), byL1: count('hint', 'l1'), withSameAnswer: Object.values(items).filter((it) => it.tasks.includes('hint') && it.sameAnswerActive.length).length,
      g023List: list.length, listNotDb, dbNotList },
    h9: { n: Object.values(items).filter((it) => it.tasks.includes('h9')).length, pending: h9.length, changedSinceJudged: h9diff, skipped: h9skip, byV2: count('h9', 'v2'), byL1: count('h9', 'l1'),
      alsoHintless: 0 },
    category: { n: Object.values(items).filter((it) => it.tasks.includes('category')).length, pending: cp.length, skipped: catSkip, nowLevelBelow3: Object.values(items).filter((it) => it.tasks.includes('category') && it.category.level !== 3).length, byL1: count('category', 'l1') },
    sensitive: SENSITIVE,
    sameAnswerGroupMismatch: saMismatch,
    active: Q.length,
  };
  writeJson('g024-plan.json', { round: 'G024', step: 'A', builtAt: new Date().toISOString(), note: 'DB 읽기만 — tasks: hint(힌트 없는 v2 3+) · h9(떠먹여 주기 다시 쓰기) · category(분야 대기) · sensitive(민감 4)', summary, items });
  console.log(JSON.stringify(summary, null, 1));
} finally { await c.end(); }
