import fs from 'node:fs';
const p = process.argv[2]; const W = 'C:/work/quiz-web/data/pipeline/audit/v027-raw/_work/';
const o = JSON.parse(fs.readFileSync(W + p + '.out.json', 'utf8')); const k = JSON.parse(fs.readFileSync(W + p + '.keys.json', 'utf8')); const gold = JSON.parse(fs.readFileSync(W + p + '.gold.json', 'utf8'));
console.log('n', o.length, k.length, 'order', o.every((x, i) => String(x.key) === k[i]));
let ex = 0, pm1 = 0; const conf = {}; const rows = [];
for (const x of o) { const g = gold[x.key]; const d = x.v2 - g; if (d === 0) ex++; if (Math.abs(d) <= 1) pm1++; rows.push([x.key, g, x.v2, d]); }
console.log('exact', ex + '/' + o.length, '±1', pm1 + '/' + o.length);
const by = {}; for (const [k2, g, v, d] of rows) { by[g] ||= []; by[g].push(d); }
for (const g of Object.keys(by).sort()) console.log('gold', g, 'diffs', by[g].join(','));
console.log('mean bias', (rows.reduce((s, r) => s + r[3], 0) / rows.length).toFixed(2));
const rd = {}; for (const x of o) rd[x.read.grade] = (rd[x.read.grade] || 0) + 1; console.log('read', rd);
console.log('miss', rows.filter((r) => r[3] !== 0).map((r) => r.join(':')).join(' '));
