import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const I = JSON.parse(fs.readFileSync('items.v028.json', 'utf8')); const G = JSON.parse(fs.readFileSync(A + '/g022-rerate.json', 'utf8')).items; const T = JSON.parse(fs.readFileSync(A + '/v028-targets.json', 'utf8'));
const ids = T.overlap.map(String).filter((i) => I[i] && G[i]); const n = ids.length;
const d = ids.map((i) => I[i].v2 - G[i].v2); const exact = d.filter((x) => x === 0).length, pm1 = d.filter((x) => Math.abs(x) <= 1).length, big = ids.filter((i, k) => Math.abs(d[k]) >= 2);
const bias = d.reduce((s, x) => s + x, 0) / n;
const byV = {}; ids.forEach((i, k) => { const v = I[i].v2; (byV[v] ||= []).push(d[k]); });
const mat = {}; ids.forEach((i) => { const key = I[i].v2 + '>' + G[i].v2; mat[key] = (mat[key] || 0) + 1; });
const rd = ids.filter((i) => I[i].flags.read.grade === G[i].flags.read.grade).length;
const rdA = ids.filter((i) => (I[i].flags.read.grade === 'a') === (G[i].flags.read.grade === 'a')).length;
const fam = ids.filter((i) => I[i].familiarity && G[i].familiarity && I[i].familiarity.level === G[i].familiarity.level).length;
const famBoth = ids.filter((i) => I[i].familiarity && G[i].familiarity).length;
const bf = (f) => ids.filter((i) => !!f(I[i]) === !!f(G[i])).length;
const flags = { h9: bf((x) => x.h9?.fix), unique: bf((x) => x.flags.unique?.flag), fact: bf((x) => x.flags.fact?.flag), variants: bf((x) => x.flags.variants.length), timeBound: bf((x) => x.flags.timeBound), category: bf((x) => x.flags.category?.ok === false), inputForm: bf((x) => x.flags.inputForm?.flag), sensitive: bf((x) => x.flags.sensitive?.flag) };
const out = { n, exact, pm1, bias: +bias.toFixed(3), maxAbs: Math.max(...d.map(Math.abs)), big: big.map((i) => ({ id: i, verify: I[i].v2, gen: G[i].v2 })), byVerifyV2: Object.fromEntries(Object.entries(byV).map(([k, a]) => [k, { n: a.length, meanDiff: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) }])), mat, readExact: rd, readAvsNot: rdA, fam, famBoth, flags,
  catBothBad: ids.filter((i) => I[i].flags.category?.ok === false && G[i].flags.category?.ok === false).length };
fs.writeFileSync('ovl.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
