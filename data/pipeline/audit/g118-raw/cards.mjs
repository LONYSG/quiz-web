// G118 — 실을 카드 모음(읽기만): A 새카드-91~100 · 102~104 · 119 · 120 · 123 · 124 · 126 · 127 · 130~141 ready 가운데 V116 ok 186
//   + B 새카드-고침-8 3장(n6484 · n6590 · n6182 — V115 fix 를 고친 판 · 설계가 대조함)
//   V116 fix 14장은 싣지 않음 · need 는 싣지 않음
import { readFileSync } from 'node:fs';
const R = new URL('../../../../', import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, R), 'utf8'));
export const CHUNKS = ['91', '92', '93', '94', '95', '96', '97', '98', '99', '100', '102', '103', '104', '119', '120', '123', '124', '126', '127', '130', '131', '132', '133', '134', '135', '136', '137', '138', '139', '140', '141'];
export function loadCards() {
  const v = J('data/pipeline/audit/v116-newcards.json'); if (v.done !== true) throw new Error('V116 done 아님');
  const verA = new Map(v.cards.map((r) => [r.key, { ...r, round: 'V116' }]));
  const out = [], drop = [], notReady = [], reject = [], fix = [];
  const take = (k, c, m, r, from, extra) => {
    if (c.status !== 'ready') { notReady.push({ key: k, answer: c.answer, status: c.status }); return; }
    if (!r) throw new Error(`판정 없음 ${k}`);
    if (r.verdict === 'fix') { fix.push({ key: k, answer: c.answer, from }); return; }
    if (r.verdict === 'reject') { reject.push({ key: k, answer: c.answer, why: r.why }); return; }
    if (r.verdict !== 'ok') throw new Error(`verdict ${r.verdict} ${k}`);
    if (!m) throw new Error(`재료 없음 ${k}`);
    out.push({ key: k, from, card: c, orig: c, mat: m, ver: r, extra });
  };
  // A
  for (const n of CHUNKS) {
    const m = J(`web-desk/tone/보낼것/새재료-${n}.json`); if (m.done !== true) throw new Error(`새재료-${n} done 아님`);
    const mat = new Map(m.items.map((x) => [x.key, { ...x, chunk: n }]));
    const c = J(`web-desk/tone/받은것/새카드-${n}.json`); if (c.done !== true) throw new Error(`새카드-${n} done 아님`);
    for (const x of c.cards) { if (verA.get(x.key) && verA.get(x.key).chunk !== n) throw new Error(`chunk 다름 ${x.key}`); take(x.key, { ...x, chunk: n }, mat.get(x.key), verA.get(x.key), `새카드-${n}`, false); }
  }
  // B — 고침-8: V115 fix 판정을 설계가 대조한 고친 판
  const v115 = J('data/pipeline/audit/v115-newcards.json');
  const g7 = new Map(J('web-desk/tone/보낼것/새카드-고침-7.json').items.map((x) => [x.key, x.chunk]));
  const gc = J('web-desk/tone/받은것/새카드-고침-8.json'); if (gc.done !== true) throw new Error('새카드-고침-8 done 아님');
  const gm = J('web-desk/tone/보낼것/새카드-고침-8.json');
  const gmat = new Map(gm.items.map((x) => { const r = v115.cards.find((y) => y.key === x.key); const ch = r.chunk === '고침-7' ? g7.get(x.key) : r.chunk; return [x.key, { ...x.material, chunk: ch }]; }));
  for (const x of gc.cards) {
    const r = v115.cards.find((y) => y.key === x.key);
    take(x.key, { ...x, chunk: gmat.get(x.key)?.chunk }, gmat.get(x.key), { ...r, round: 'V115', verdict: 'ok', fixedBy: '새카드-고침-8(설계 대조)', v115verdict: r.verdict }, '새카드-고침-8', true);
  }
  return { cards: out, drop, notReady, reject, fix, v };
}
