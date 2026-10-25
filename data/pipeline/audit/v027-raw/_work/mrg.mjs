import fs from 'node:fs';
const W = 'C:/work/quiz-web/data/pipeline/audit/v027-raw/_work/';
const map = JSON.parse(fs.readFileSync(W + 'main.map.json', 'utf8'));
const res = {}; const cal = []; let n = 0;
const pcs = fs.readdirSync(W).filter((f) => /^p\d\d\.out\.json$/.test(f)).sort();
for (const f of pcs) { for (const x of JSON.parse(fs.readFileSync(W + f, 'utf8'))) { const m = map[x.key]; n++; if (m.cal) cal.push({ ...x, gold: m.gold, anchor: m.cal, piece: f.slice(0, 3) }); else res[m.id] = { ...x, piece: f.slice(0, 3) }; } }
fs.writeFileSync(W + 'merged.json', JSON.stringify({ res, cal }));
const d = cal.map((c) => c.v2 - c.gold); const ex = d.filter((v) => v === 0).length;
console.log('pieces', pcs.length, 'items', Object.keys(res).length, 'cal', cal.length, 'cal exact', ex, (100 * ex / cal.length).toFixed(1) + '%', '±1', d.filter((v) => Math.abs(v) <= 1).length, 'maxd', Math.max(...d.map(Math.abs)), 'bias', (d.reduce((s, v) => s + v, 0) / d.length).toFixed(3));
const by = {}; for (const c of cal) { by[c.gold] ||= []; by[c.gold].push(c.v2 - c.gold); } for (const g of Object.keys(by)) console.log('gold', g, 'n', by[g].length, 'mean', (by[g].reduce((s, v) => s + v, 0) / by[g].length).toFixed(2));
const T = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v027-targets.json', 'utf8'));
const miss = Object.values(T.items).filter((x) => x.active && !res[x.id]).length; console.log('target active', Object.values(T.items).filter((x) => x.active).length, 'missing', miss);
