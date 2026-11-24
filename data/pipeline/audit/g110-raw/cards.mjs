// G110 — 실을 카드 모음(읽기만): V110 ok + 새카드-고침-2(drop 뺌) · reject 뺌 · 재료 · V110 을 key 로 묶는다
import { readFileSync } from 'node:fs';
const R = new URL('../../../../', import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, R), 'utf8'));
export function loadCards() {
  const mat = new Map(), card = new Map();
  for (let i = 16; i <= 34; i++) {
    const n = String(i).padStart(2, '0');
    const m = J(`web-desk/tone/보낼것/새재료-${n}.json`); if (!m.done) throw new Error(`새재료-${n} done 아님`);
    for (const x of m.items) mat.set(x.key, { ...x, chunk: n });
    const c = J(`web-desk/tone/받은것/새카드-${n}.json`); if (!c.done) throw new Error(`새카드-${n} done 아님`);
    for (const x of c.cards) card.set(x.key, { ...x, chunk: n });
  }
  const v = J('data/pipeline/audit/v110-newcards.json'); if (!v.done) throw new Error('V110 done 아님');
  const ver = new Map(v.results.map((r) => [r.key, r]));
  const fix = J('web-desk/tone/받은것/새카드-고침-2.json'); if (!fix.done) throw new Error('고침-2 done 아님');
  const fixed = new Map(fix.cards.map((x) => [x.key, x]));
  const out = [], drop = [], notReady = [], reject = [];
  for (const [k, c] of card) {
    if (c.status !== 'ready') { notReady.push(k); continue; }
    const r = ver.get(k); if (!r) throw new Error(`V110 에 없음 ${k}`);
    let use = c, from = `새카드-${c.chunk}`;
    if (r.verdict === 'fix') {
      const f = fixed.get(k); if (!f) throw new Error(`고침본 없음 ${k}`);
      if (f.status === 'drop') { drop.push({ key: k, answer: c.answer, why: f.note }); continue; }
      if (f.status !== 'ready') throw new Error(`고침본 status ${f.status} ${k}`);
      use = { ...c, ...f }; from = '새카드-고침-2';
    } else if (r.verdict === 'reject') { reject.push({ key: k, answer: c.answer, why: r.why }); continue; }
    else if (r.verdict !== 'ok') throw new Error(`verdict ${r.verdict} ${k}`);
    out.push({ key: k, from, card: use, mat: mat.get(k), ver: r });
  }
  return { cards: out, drop, notReady, reject, fixCount: fix.cards.length };
}
