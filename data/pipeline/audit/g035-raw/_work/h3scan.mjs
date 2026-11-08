// C — 새 질문 때문에 힌트-질문 겹침(2글자 조각 비율)이 늘어난 곳 훑기(기계 H3 60% 아래까지)
import { rj } from './db.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
const strip = (s) => normalizeAnswer(s ?? '').replace(/[^0-9a-z가-힣]/g, '');
const grams = (s) => { const t = strip(s); const g = new Set(); for (let i = 0; i + 2 <= t.length; i++) g.add(t.slice(i, i + 2)); return g; };
const share = (h, q) => { const hg = grams(h), qg = grams(q); return hg.size ? [...hg].filter((g) => qg.has(g)).length / hg.size : 0; };
const P = rj('g035-plan.json'); const F = new Map(rj('g035-raw/q-final.json').items.map((x) => [x.id, x]));
const rows = [];
for (const q of P.Q) { const f = F.get(q.id); const a = share(f.hint, q.before), b = share(f.hint, f.q); rows.push({ id: q.id, a: Math.round(a * 100), b: Math.round(b * 100), d: Math.round((b - a) * 100), hint: f.hint, q: f.q }); }
rows.sort((x, y) => y.d - x.d);
for (const r of rows.filter((r) => r.d >= 8 || r.b >= 45)) console.log(`#${r.id} ${r.a}→${r.b} (+${r.d})\n  Q ${r.q}\n  H ${r.hint}`);
