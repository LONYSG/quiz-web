// C — g038-decisions.json: 호스트 힌트당 결정 하나(step H = 전수 판정 A·L · R = G037 54 중 안 받은 12 제안문만)
//   제안문 = 조각 proposal(기계 통과) → 아니면 다시 쓴 것(out/redo.json · 기계 통과) → 그래도 걸리면 안 받음(notTaken)
import { existsSync, readFileSync } from 'node:fs';
import { rj, wj, withDb, ROWSQL, AUD } from './db.mjs';
import { checkProps } from './check-prop.mjs';
const AG = rj('g038-raw/agg.json').all;
const R12 = rj('g038-raw/r12-gen.json').items;
const MAN = { 6348: ['A', "천호식품 회장의 '남자한테 참 좋은데…' 광고로 뜬 열매로, 이른 봄 노란 꽃이 마을을 덮는 전남 구례가 산지로 이름났다.", 'GEN — p10 조각이 빠뜨린 1건 · 지리산 = 덧붙임(국립공원 문항)'] };
const redo = existsSync(AUD('g038-raw/out/redo.json')) ? new Map(rj('g038-raw/out/redo.json').map((x) => [x.id, x])) : new Map();
const cand = [];
for (const x of AG) if (['A', 'L'].includes(x.cls)) cand.push({ id: x.id, cls: x.cls, piece: x.piece, cross: x.cross, first: x.proposal, firstOk: x.check?.ok, redo: redo.get(x.id)?.proposal, why: x.why });
for (const [id, [cls, p, why]] of Object.entries(MAN)) cand.push({ id: +id, cls, piece: 'GEN', cross: [], first: p, firstOk: null, why });
// 기계 거르기 — 첫 제안(미확인 것) · 다시 쓴 것
const need = cand.filter((c) => c.firstOk !== true || c.id === 1839).flatMap((c) => [c.firstOk === null ? { id: c.id, proposal: c.first, cross: c.cross, k: 'first' } : null, c.redo ? { id: c.id, proposal: c.redo, cross: c.cross, k: 'redo' } : null]).filter(Boolean);
const res = await checkProps(need); const ok = new Map(); need.forEach((n, i) => ok.set(`${n.id}:${n.k}`, res[i]));
const items = {}; const notTaken = [];
await withDb(async (c) => {
  const ids = [...cand.map((x) => x.id), ...Object.keys(R12).map(Number)];
  const rows = new Map((await c.query(ROWSQL, [ids])).rows.map((r) => [Number(r.id), r]));
  for (const x of cand) {
    let p = null; let src = null;
    if (x.firstOk === true && x.id !== 1839) { p = x.first; src = '조각 제안'; }
    else if (x.firstOk === null && ok.get(`${x.id}:first`)?.ok) { p = x.first; src = 'GEN'; }
    else if (x.redo && ok.get(`${x.id}:redo`)?.ok) { p = x.redo; src = '다시 쓴 것(2회째)'; }
    if (x.id === 1839 && x.redo && ok.get(`${x.id}:redo`)?.ok) { p = x.redo; src = '다시 쓴 것(GEN 재독 — 초인 = 위버멘시)'; }
    const r = rows.get(x.id);
    if (!p) { notTaken.push({ id: x.id, cls: x.cls, why: '다시 써도 기계 거르기 걸림', first: x.first, redo: x.redo ?? null, check: ok.get(`${x.id}:redo`) ?? null }); continue; }
    items[x.id] = { id: x.id, step: 'H', cv: 'CV-162', before: { question_text: r.question_text, general_hint: r.general_hint, explanation: r.explanation, display_answer: r.display_answer, variants: r.variants }, general_hint: p, why: `crossans ${x.cls === 'L' ? '누설' : '덧붙임'} · ${x.piece} · ${src} — ${String(x.why ?? '').slice(0, 120)}` };
  }
  for (const [id, [p, why]] of Object.entries(R12)) {
    const r = rows.get(+id);
    items[id] = { id: +id, step: 'R', cv: 'CV-162', before: { question_text: r.question_text, general_hint: r.general_hint, explanation: r.explanation, display_answer: r.display_answer, variants: r.variants }, general_hint: p, why: `G037 54 중 안 받은 12 — V038 분류 그대로 · GEN 제안문만 — ${why}` };
  }
});
const cnt = {}; for (const d of Object.values(items)) cnt[d.step] = (cnt[d.step] ?? 0) + 1;
wj('g038-decisions.json', { round: 'G038', at: new Date().toISOString(), source: 'g038-raw/agg.json · out/redo.json · r12-gen.json', counts: cnt, notTaken, items });
console.log(cnt, 'notTaken', notTaken.length, notTaken.map((x) => x.id).join(' '));
