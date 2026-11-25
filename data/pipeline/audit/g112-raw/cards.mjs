// G112 — 실을 카드 모음(읽기만): V111 ok + 새카드-고침-4(drop 뺌) · reject 뺌 + 덧붙임(고침-3 두 장 · n1802 고침-2) · 재료 · 판정을 key 로 묶는다
import { readFileSync } from 'node:fs';
const R = new URL('../../../../', import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, R), 'utf8'));
const chunks = (a, b, mat, card) => {
  for (let i = a; i <= b; i++) {
    const n = String(i).padStart(2, '0');
    const m = J(`web-desk/tone/보낼것/새재료-${n}.json`); if (m.done !== true) throw new Error(`새재료-${n} done 아님`);
    for (const x of m.items) mat.set(x.key, { ...x, chunk: n });
    const c = J(`web-desk/tone/받은것/새카드-${n}.json`); if (c.done !== true) throw new Error(`새카드-${n} done 아님`);
    for (const x of c.cards) card.set(x.key, { ...x, chunk: n });
  }
};
export const EXTRA = { n1619: '새카드-고침-3', n1916: '새카드-고침-3', n1802: '새카드-고침-2' };
export function loadCards() {
  const mat = new Map(), card = new Map();
  chunks(35, 59, mat, card);
  const v = J('data/pipeline/audit/v111-newcards.json'); if (v.done !== true) throw new Error('V111 done 아님');
  const ver = new Map(v.items.map((r) => [r.key, { ...r, round: 'V111' }]));
  const fix = J('web-desk/tone/받은것/새카드-고침-4.json'); if (fix.done !== true) throw new Error('고침-4 done 아님');
  const fixed = new Map(fix.cards.map((x) => [x.key, x]));
  const out = [], drop = [], notReady = [], reject = [];
  for (const [k, c] of card) {
    if (c.status !== 'ready') { notReady.push({ key: k, answer: c.answer, status: c.status }); continue; }
    const r = ver.get(k); if (!r) throw new Error(`V111 에 없음 ${k}`);
    let use = c, from = `새카드-${c.chunk}`;
    if (r.verdict === 'fix') {
      const f = fixed.get(k); if (!f) throw new Error(`고침본 없음 ${k}`);
      if (f.status === 'drop') { drop.push({ key: k, answer: c.answer, why: f.note }); continue; }
      if (f.status !== 'ready') throw new Error(`고침본 status ${f.status} ${k}`);
      use = { ...c, ...f }; from = '새카드-고침-4';
    } else if (r.verdict === 'reject') { reject.push({ key: k, answer: c.answer, why: r.why }); continue; }
    else if (r.verdict !== 'ok') throw new Error(`verdict ${r.verdict} ${k}`);
    out.push({ key: k, from, card: use, mat: mat.get(k), ver: r });
  }
  // 덧붙임: G110 의 재료 · 판정 그대로(V110) · 카드는 고침본
  const mat2 = new Map(), card2 = new Map();
  chunks(16, 34, mat2, card2);
  const v110 = J('data/pipeline/audit/v110-newcards.json'); if (v110.done !== true) throw new Error('V110 done 아님');
  const ver2 = new Map(v110.results.map((r) => [r.key, { ...r, round: 'V110' }]));
  const f3 = J('web-desk/tone/받은것/새카드-고침-3.json'); if (f3.done !== true) throw new Error('고침-3 done 아님');
  const f2 = J('web-desk/tone/받은것/새카드-고침-2.json'); if (f2.done !== true) throw new Error('고침-2 done 아님');
  const fx = new Map([...f2.cards.filter((x) => x.key === 'n1802'), ...f3.cards].map((x) => [x.key, x]));
  for (const [k, from] of Object.entries(EXTRA)) {
    const f = fx.get(k); if (!f || f.status !== 'ready') throw new Error(`덧붙임 고침본 ${k} ${f?.status}`);
    out.push({ key: k, from, card: { ...card2.get(k), ...f }, mat: mat2.get(k), ver: ver2.get(k), extra: true });
  }
  return { cards: out, drop, notReady, reject, fixCount: fix.cards.length, v };
}
