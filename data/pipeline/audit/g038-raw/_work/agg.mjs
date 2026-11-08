// 조각 결과 모으기 + 기계 거르기 — out/pXX.json → g038-raw/agg.json
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { checkProps } from './check-prop.mjs';
const D = 'data/pipeline/audit/g038-raw/';
const all = []; const per = {};
for (const f of readdirSync(D + 'out').filter((f) => /^p\d+\.json$/.test(f)).sort()) {
  const I = new Map(JSON.parse(readFileSync(D + 'in/' + f, 'utf8')).map((x) => [x.id, x]));
  const O = JSON.parse(readFileSync(D + 'out/' + f, 'utf8'));
  const c = { n: O.length, C: 0, A: 0, L: 0, F: 0, missing: I.size - O.length };
  for (const o of O) { c[o.cls]++; all.push({ piece: f.slice(0, 3), ...o, grade: I.get(o.id)?.grade, answer: I.get(o.id)?.answer, hint: I.get(o.id)?.hint, crossIn: I.get(o.id)?.cross }); }
  per[f.slice(0, 3)] = c;
}
const props = all.filter((x) => ['A', 'L'].includes(x.cls) && x.proposal);
const chk = new Map((await checkProps(props.map((x) => ({ id: x.id, proposal: x.proposal, cross: x.cross })))).map((r) => [r.id, r]));
for (const x of all) x.check = chk.get(x.id) ?? null;
writeFileSync(D + 'agg.json', JSON.stringify({ per, all }, null, 1));
const tot = { C: 0, A: 0, L: 0, F: 0 }; for (const x of all) tot[x.cls]++;
const AL = all.length ? (tot.A + tot.L) / all.length : 0;
console.log('hosts', all.length, tot, 'A+L', (AL * 100).toFixed(0) + '%', 'noProposal', all.filter((x) => ['A', 'L'].includes(x.cls) && !x.proposal).length);
console.log('check ok', [...chk.values()].filter((r) => r.ok).length, '/', chk.size, '· block', [...chk.values()].filter((r) => r.block.length).length, '· newCross', [...chk.values()].filter((r) => r.newCross.length).length, '· targetLeft', [...chk.values()].filter((r) => r.targetLeft.length).length);
for (const [p, c] of Object.entries(per)) { const r = (c.A + c.L) / c.n; console.log(p, JSON.stringify(c), Math.abs(r - AL) > 0.15 ? '★ 편차' : ''); }
