// G116 — 실을 카드 모음(읽기만): 새카드-77~79 ready 가운데 V114 ok 만(fix 2 는 V115 로)
import { readFileSync } from 'node:fs';
const R = new URL('../../../../', import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, R), 'utf8'));
export const CHUNKS = ['77', '78', '79'];
export function loadCards() {
  const mat = new Map(), card = new Map();
  for (const n of CHUNKS) {
    const m = J(`web-desk/tone/보낼것/새재료-${n}.json`); if (m.done !== true) throw new Error(`새재료-${n} done 아님`);
    for (const x of m.items) mat.set(x.key, { ...x, chunk: n });
    const c = J(`web-desk/tone/받은것/새카드-${n}.json`); if (c.done !== true) throw new Error(`새카드-${n} done 아님`);
    for (const x of c.cards) card.set(x.key, { ...x, chunk: n });
  }
  const v = J('data/pipeline/audit/v114-newcards.json'); if (v.done !== true) throw new Error('V114 done 아님');
  const ver = new Map(v.cards.map((r) => [r.key, { ...r, round: 'V114' }]));
  const out = [], drop = [], notReady = [], reject = [], fix = [];
  for (const [k, c] of card) {
    if (c.status !== 'ready') { notReady.push({ key: k, answer: c.answer, status: c.status }); continue; }
    const r = ver.get(k); if (!r) throw new Error(`V114 에 없음 ${k}`);
    if (r.verdict === 'fix') { fix.push({ key: k, answer: c.answer }); continue; }
    if (r.verdict === 'reject') { reject.push({ key: k, answer: c.answer, why: r.why }); continue; }
    if (r.verdict !== 'ok') throw new Error(`verdict ${r.verdict} ${k}`);
    out.push({ key: k, from: `새카드-${c.chunk}`, card: c, orig: c, mat: mat.get(k), ver: r });
  }
  return { cards: out, drop, notReady, reject, fix, v };
}
