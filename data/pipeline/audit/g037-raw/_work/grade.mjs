// blind 채점 — 대표 정답 · 변형(결정 뒤 모습) 정규화 일치 · 아니면 '?' 로 눈 확인
import { rj, wj } from './db.mjs';
import { normalizeAnswer as N } from '../../../../../shared/dist/index.js';
const D = rj('g037-decisions.json').items;
const ok = (id, g) => { const d = D[id]; const set = [d.display_answer ?? d.before.display_answer, ...d.before.variants, ...(d.add ?? [])].map(N); const x = N(g); return set.includes(x) || set.some((s) => s.length >= 2 && (x.includes(s) || s.includes(x) && x.length >= 2)) ? (set.includes(x) ? 1 : 0.5) : 0; };
const res = {};
for (const k of ['qa', 'qb', 'h']) {
  const out = rj(`g037-raw/blind/${k}-out.json`);
  res[k] = out.map((o) => ({ id: o.id, guess: o.guess, ans: D[o.id].display_answer ?? D[o.id].before.display_answer, hit: ok(o.id, o.guess) }));
  console.log(k, 'hit', res[k].filter((x) => x.hit === 1).length, 'partial', res[k].filter((x) => x.hit === 0.5).map((x) => `${x.id} ${x.guess}/${x.ans}`).join(', '), '\n  miss', res[k].filter((x) => !x.hit).map((x) => `${x.id} ${x.guess}/${x.ans}`).join(', '));
}
wj('g037-raw/blind/graded.json', res);
