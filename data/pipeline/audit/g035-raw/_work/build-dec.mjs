// D — g035-decisions.json 만들기: Q(질문 358) · H(힌트) · V(변형) · F(사실) 를 문항당 결정 하나로 합친다
//   (lib 은 결정마다 지금 DB 값으로 반영 뒤 모습을 검사하므로, 같은 행의 질문·힌트·변형은 한 결정에 둬야 새 질문으로 힌트를 본다)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { rj, wj, withDb, ROWSQL, AUD } from './db.mjs';
const P = rj('g035-plan.json');
const V037 = new Map(rj('v037-refurb.json').items.map((x) => [x.id, x]));
const rr = { q: {}, h: {}, notTaken: {}, keepNote: {}, factResolved: {} };
for (const f of readdirSync(AUD('g035-raw/rr')).filter((f) => /^rr-\d+\.json$/.test(f)).sort()) {
  const o = JSON.parse(readFileSync(AUD('g035-raw/rr/' + f), 'utf8'));
  for (const k of Object.keys(rr)) Object.assign(rr[k], o[k] ?? {});
}
const VD = rj('g035-raw/rr/v-decisions.json');
const FD = existsSync(AUD('g035-raw/rr/f-decisions.json')) ? rj('g035-raw/rr/f-decisions.json') : { edits: {}, keep: {} };
const ids = new Set([...P.Q.map((q) => q.id), ...Object.keys(rr.h), ...Object.keys(VD.add), ...Object.keys(FD.edits)]);
const items = {};
await withDb(async (c) => {
  const rows = new Map((await c.query(ROWSQL, [[...ids].map(Number)])).rows.map((r) => [r.id, r]));
  for (const id of [...ids].sort((a, b) => a - b)) {
    const r = rows.get(id); const d = { id: Number(id), before: { question_text: r.question_text, general_hint: r.general_hint, explanation: r.explanation, variants: r.variants }, why: [], parts: [] };
    const q = P.Q.find((x) => x.id === id);
    if (q) {
      const after = rr.q[id]?.after ?? q.fix_text;
      d.question_text = after; d.parts.push('Q'); d.v037_fix_text = q.fix_text;
      d.why.push(rr.q[id] ? `질문: V037 fix_text 를 GEN 이 손질 — ${rr.q[id].why}` : '질문: V037 fix_text 그대로(GEN 재독 통과)');
      if (rr.keepNote[id]) d.why.push(`재독 메모: ${rr.keepNote[id]}`);
    }
    if (rr.h[id]) { d.general_hint = rr.h[id].hint; d.parts.push('H'); d.why.push(`힌트: ${rr.h[id].why}`); }
    if (VD.add[id]) { d.add = VD.add[id].v; d.parts.push('V'); d.why.push(`변형: ${VD.add[id].why}`); }
    const fe = FD.edits[id];
    if (fe) {
      for (const col of ['question_text', 'general_hint', 'explanation']) if (fe[col] !== undefined) d[col] = fe[col];
      d.parts.push('F'); d.why.push(`사실: ${fe.why}`); d.sources = fe.sources;
    }
    const nt = [];
    if (rr.notTaken[id]) nt.push({ field: rr.notTaken[id].field, proposal: 'V037 flags', why: rr.notTaken[id].why });
    if (VD.notTaken[id] && VD.notTaken[id] !== '-') nt.push({ field: 'variants', proposal: (V037.get(id)?.flags ?? []).filter((f) => f.startsWith('variant_missing')).join(' | '), why: VD.notTaken[id] });
    if (nt.length) d.notTaken = nt;
    // 바뀌는 것이 없으면(질문이 같고 힌트 · 변형 · 사실 없음) 결정에서 뺀다
    if (d.question_text === r.question_text) { delete d.question_text; d.parts = d.parts.filter((p) => p !== 'Q'); }
    if (!d.parts.length) continue;
    d.step = d.parts.includes('Q') ? 'Q' : d.parts.includes('H') ? 'H' : d.parts.includes('F') ? 'F' : 'V';
    d.cv = d.parts.includes('Q') || d.parts.includes('H') ? 'CV-157' : 'CV-157 flags';
    d.why = d.why.join(' · ');
    items[id] = d;
  }
});
// 안 받은 변형만 있는 문항(쓸 것 없음)은 notTaken 으로만 남긴다
const notTakenOnly = Object.entries(VD.notTaken).filter(([id, w]) => w !== '-' && !items[id]).map(([id, why]) => ({ id: Number(id), field: 'variants', why }));
wj('g035-decisions.json', { round: 'G035', at: new Date().toISOString(), note: 'V037 반영 — step Q(질문) · H(힌트) · V(변형) · F(사실). 한 문항 = 결정 하나(parts 에 갈래). 알가치·등급은 안 바꿈(CV-158 (b) · 브리프 ⑸⑹).', U: VD.U, factKeep: FD.keep, notTakenOnly, items });
const cnt = {}; for (const d of Object.values(items)) for (const p of d.parts) cnt[p] = (cnt[p] ?? 0) + 1;
console.log('결정', Object.keys(items).length, cnt, 'notTakenOnly', notTakenOnly.length);
