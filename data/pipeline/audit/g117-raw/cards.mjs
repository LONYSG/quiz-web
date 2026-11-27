// G117 — 실을 카드 모음(읽기만): A 새카드-81~90 ready 가운데 V115 ok 47 · B 새카드-고침-7 가운데 V115(chunk 고침-7) ok 15
//   fix 3(n6484 · n6590 · n6182)은 싣지 않음 · n6543(need)도 싣지 않음
import { readFileSync } from 'node:fs';
const R = new URL('../../../../', import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, R), 'utf8'));
export const CHUNKS = ['81', '82', '83', '84', '85', '86', '87', '88', '89', '90'];
export function loadCards() {
  const v = J('data/pipeline/audit/v115-newcards.json'); if (v.done !== true) throw new Error('V115 done 아님');
  const verA = new Map(v.cards.filter((r) => r.chunk !== '고침-7').map((r) => [r.key, { ...r, round: 'V115' }]));
  const verB = new Map(v.cards.filter((r) => r.chunk === '고침-7').map((r) => [r.key, { ...r, round: 'V115' }]));
  const out = [], drop = [], notReady = [], reject = [], fix = [];
  const take = (k, c, m, r, from, extra) => {
    if (c.status !== 'ready') { notReady.push({ key: k, answer: c.answer, status: c.status }); return; }
    if (!r) throw new Error(`V115 에 없음 ${k}`);
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
  // B
  const gc = J('web-desk/tone/받은것/새카드-고침-7.json'); if (gc.done !== true) throw new Error('새카드-고침-7 done 아님');
  const gm = J('web-desk/tone/보낼것/새카드-고침-7.json');
  const gmat = new Map(gm.items.map((x) => [x.key, { ...x.material, chunk: x.chunk }]));
  for (const x of gc.cards) take(x.key, { ...x, chunk: gmat.get(x.key)?.chunk }, gmat.get(x.key), verB.get(x.key), '새카드-고침-7', true);
  return { cards: out, drop, notReady, reject, fix, v };
}
