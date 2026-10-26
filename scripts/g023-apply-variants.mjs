#!/usr/bin/env node
// =============================================================================
// G023 H — 변형 추가(question_answers INSERT 만 · 삭제 없음)
//   대상  g023-plan items[id].variants.take — 판정자 flags.variants + inputForm 표시의 제안 중 안전한 종류만:
//         punct(띄어쓰기·중점·하이픈·괄호) · number(아라비아 ↔ 한글 수사) · counter(숫자 + 개·번·회 …) · latin(영문 대문자 약어)
//         · hangul-of-latin(대문자 약어의 글자 읽기) · suffix(신 · 씨 · 님 · 섬 · 꽃 — 분야가 맞을 때)
//   ★ 쓰기 직전 다시: 정규화 중복(기존 변형·대표) · 다른 활성 문항 주 답과 같음 · 적재 게이트(checkAnswerSet — 지금 질문 문구)
//   출력  audit/g023-undo-variants.json (넣은 행 id) · 나머지는 g023-variants-pending.json
//   사용  node scripts/g023-apply-variants.mjs [--dry-run | --apply | --undo [--ids 행id,…]]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, loadPlan, readJson, writeJson, exists, MODE } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const UNDO = 'g023-undo-variants.json';
const NOTE = 'G023 변형 추가';
const ONLY = (() => { const i = process.argv.indexOf('--ids'); return i > 0 ? process.argv[i + 1].split(',').map(Number) : null; })();
const plan = loadPlan();
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); await guardNoOpenGames(c, 'g023 H undo');
    const rowIds = ONLY ?? u.rows.map((r) => r.rowId);
    const n = (await c.query(`delete from question_answers where id = any($1::bigint[]) and note like $2 || '%'`, [rowIds, NOTE])).rowCount;
    u.rows = u.rows.filter((r) => !rowIds.includes(r.rowId)); u.reverted = [...(u.reverted ?? []), ...rowIds]; writeJson(UNDO, u);
    console.log(`[g023 H] 지웠다 ${n}행`); process.exit(0);
  }
  const sel = Object.entries(plan.items).filter(([, it]) => it.variants?.take?.length);
  const reverted = new Set(exists(UNDO) ? (readJson(UNDO).revertedKeys ?? []) : []);
  const { rows } = await c.query(`select q.id, q.question_text, q.display_answer, coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants
      from questions q where q.is_active and q.id = any($1::bigint[])`, [sel.map(([id]) => id)]);
  const DB = new Map(rows.map((r) => [String(r.id), r]));
  const { rows: prim } = await c.query('select a.question_id, a.answer_norm from question_answers a join questions q on q.id=a.question_id where q.is_active and a.is_primary');
  const P = new Map(); for (const r of prim) { if (!P.has(r.answer_norm)) P.set(r.answer_norm, []); P.get(r.answer_norm).push(String(r.question_id)); }
  const todo = []; const skipped = []; let done = 0; const by = {};
  for (const [id, it] of sel) {
    const r = DB.get(id); if (!r) { skipped.push({ id, why: '활성 아님' }); continue; }
    const have = new Set([normalizeAnswer(r.display_answer), ...r.variants.map(normalizeAnswer)]);
    const add = [];
    for (const t of it.variants.take) {
      const nv = normalizeAnswer(t.v);
      if (r.variants.includes(t.v)) { done++; continue; }
      if (reverted.has(`${id}|${t.v}`)) { skipped.push({ id, v: t.v, why: '표본 재독으로 되돌림' }); continue; }
      if (have.has(nv)) { skipped.push({ id, v: t.v, why: '정규화 중복' }); continue; }
      if ((P.get(nv) ?? []).some((q) => q !== id)) { skipped.push({ id, v: t.v, why: '다른 문항 주 답' }); continue; }
      add.push(t); have.add(nv);
    }
    if (!add.length) continue;
    const g = checkAnswerSet(r.question_text, r.display_answer, [...r.variants, ...add.map((t) => t.v)], normalizeAnswer);
    for (const t of add) {
      const bad = g.dropped.find((x) => x.answer === t.v) ?? g.blocked.find((x) => x.answer === t.v);
      if (bad) { skipped.push({ id, v: t.v, why: `게이트 ${bad.kind ?? 'blocked'}` }); continue; }
      todo.push({ id, v: t.v, kind: t.kind, from: t.from, via: t.via, answer: r.display_answer }); by[t.kind] = (by[t.kind] ?? 0) + 1;
    }
  }
  console.log(`[g023 H] 계획 문항 ${sel.length} · 넣을 행 ${todo.length} (${new Set(todo.map((t) => t.id)).size} 문항) · 이미 있음 ${done} · 건너뜀 ${skipped.length}`);
  console.log(`  종류별 ${JSON.stringify(by)}`);
  for (const s of skipped) console.log('  건너뜀', s.id, s.v ?? '', s.why);
  if (MODE !== 'apply') { console.log('[g023 H] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g023 H'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G023', step: 'H', note: `넣은 question_answers 행 — --undo 는 note '${NOTE}' 행만 지운다`, rows: [] };
  await c.query('begin');
  for (const t of todo) {
    const { rows: ins } = await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing returning id', [t.id, t.v, normalizeAnswer(t.v), `${NOTE}(${t.kind})`]);
    if (ins[0]) undo.rows.push({ rowId: Number(ins[0].id), questionId: Number(t.id), answer: t.answer, v: t.v, kind: t.kind, from: t.from, via: t.via });
  }
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('commit');
  console.log(`[g023 H] 넣었다 ${undo.rows.length}행(누적) · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end(); }
