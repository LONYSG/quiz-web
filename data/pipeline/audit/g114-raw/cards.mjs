// G114 — 실을 카드 모음(읽기만): 새카드-60~66 · 68 ready 가운데 V112 ok → 그 카드 · fix(n6005) → 받은것/새카드-고침-6.json 의 card
import { readFileSync } from 'node:fs';
const R = new URL('../../../../', import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, R), 'utf8'));
export const CHUNKS = ['60', '61', '62', '63', '64', '65', '66', '68'];
export function loadCards() {
  const mat = new Map(), card = new Map();
  for (const n of CHUNKS) {
    const m = J(`web-desk/tone/보낼것/새재료-${n}.json`); if (m.done !== true) throw new Error(`새재료-${n} done 아님`);
    for (const x of m.items) mat.set(x.key, { ...x, chunk: n });
    const c = J(`web-desk/tone/받은것/새카드-${n}.json`); if (c.done !== true) throw new Error(`새카드-${n} done 아님`);
    for (const x of c.cards) card.set(x.key, { ...x, chunk: n });
  }
  const v = J('data/pipeline/audit/v112-newcards.json'); if (v.done !== true) throw new Error('V112 done 아님');
  const ver = new Map(v.cards.map((r) => [r.key, { ...r, round: 'V112' }]));
  const fix = J('web-desk/tone/받은것/새카드-고침-6.json'); if (fix.done !== true) throw new Error('고침-6 done 아님');
  const fixed = new Map(fix.cards.map((x) => [x.key, x]));
  const out = [], drop = [], notReady = [], reject = [];
  for (const [k, c] of card) {
    if (c.status !== 'ready') { notReady.push({ key: k, answer: c.answer, status: c.status }); continue; }
    const r = ver.get(k); if (!r) throw new Error(`V112 에 없음 ${k}`);
    let use = c, from = `새카드-${c.chunk}`;
    if (r.verdict === 'fix') {
      const f = fixed.get(k); if (!f) throw new Error(`고침본 없음 ${k}`);
      if (f.status !== 'ready') { drop.push({ key: k, answer: c.answer, why: f.note ?? f.status }); continue; }
      use = { ...c, ...f }; from = '새카드-고침-6';
    } else if (r.verdict === 'reject') { reject.push({ key: k, answer: c.answer, why: r.why }); continue; }
    else if (r.verdict !== 'ok') throw new Error(`verdict ${r.verdict} ${k}`);
    out.push({ key: k, from, card: use, orig: c, mat: mat.get(k), ver: r });
  }
  return { cards: out, drop, notReady, reject, v, fix: fixed };
}
