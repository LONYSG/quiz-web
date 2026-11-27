// G115 — 실을 카드 모음(읽기만): 새카드-67 · 69~76 ready 가운데 V113 ok 만(fix 12 는 gpt 고침 뒤 다음 판)
import { readFileSync } from 'node:fs';
const R = new URL('../../../../', import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, R), 'utf8'));
export const CHUNKS = ['67', '69', '70', '71', '72', '73', '74', '75', '76'];
export function loadCards() {
  const mat = new Map(), card = new Map();
  for (const n of CHUNKS) {
    const m = J(`web-desk/tone/보낼것/새재료-${n}.json`); if (m.done !== true) throw new Error(`새재료-${n} done 아님`);
    for (const x of m.items) mat.set(x.key, { ...x, chunk: n });
    const c = J(`web-desk/tone/받은것/새카드-${n}.json`); if (c.done !== true) throw new Error(`새카드-${n} done 아님`);
    for (const x of c.cards) card.set(x.key, { ...x, chunk: n });
  }
  const v = J('data/pipeline/audit/v113-newcards.json'); if (v.done !== true) throw new Error('V113 done 아님');
  const ver = new Map(v.cards.map((r) => [r.key, { ...r, round: 'V113' }]));
  const out = [], drop = [], notReady = [], reject = [], fix = [];
  for (const [k, c] of card) {
    if (c.status !== 'ready') { notReady.push({ key: k, answer: c.answer, status: c.status }); continue; }
    const r = ver.get(k); if (!r) throw new Error(`V113 에 없음 ${k}`);
    if (r.verdict === 'fix') { fix.push({ key: k, answer: c.answer }); continue; }
    if (r.verdict === 'reject') { reject.push({ key: k, answer: c.answer, why: r.why }); continue; }
    if (r.verdict !== 'ok') throw new Error(`verdict ${r.verdict} ${k}`);
    out.push({ key: k, from: `새카드-${c.chunk}`, card: c, orig: c, mat: mat.get(k), ver: r });
  }
  return { cards: out, drop, notReady, reject, fix, v };
}
