import fs from 'node:fs';
const W = 'C:/work/quiz-web/data/pipeline/audit/v028-raw/_work/'; const map = JSON.parse(fs.readFileSync(W + 'main.map.json', 'utf8'));
for (const p of process.argv.slice(2)) {
  let o; try { o = JSON.parse(fs.readFileSync(W + p + '.out.json', 'utf8')); } catch (e) { console.log(p, 'PARSE FAIL', e.message); continue; }
  const k = JSON.parse(fs.readFileSync(W + p + '.keys.json', 'utf8')); const errs = [];
  if (o.length !== k.length) errs.push('len ' + o.length + '/' + k.length);
  if (!o.every((x, i) => String(x.key) === k[i])) errs.push('order');
  for (const x of o) { if (![1,2,3,4,5].includes(x.v2)) errs.push('v2 ' + x.key); if (!['high','mid','low'].includes(x.conf)) errs.push('conf ' + x.key); if (!x.read || !['a','b','c'].includes(x.read.grade)) errs.push('read ' + x.key); else if (x.read.grade !== 'a' && !x.read.proposal) errs.push('noproposal ' + x.key); if (!x.h9 || !x.unique || !x.fact || !x.category || !x.inputForm || !x.sensitive || !Array.isArray(x.variants) || !Array.isArray(x.tags)) errs.push('field ' + x.key); }
  const cal = o.filter((x) => map[x.key]?.cal); const d = cal.map((x) => x.v2 - map[x.key].gold); const ex = d.filter((v) => v === 0).length; const maxd = Math.max(...d.map(Math.abs)); const bias = d.reduce((s, v) => s + v, 0) / (d.length || 1);
  const c = {}; for (const x of o) c[x.v2] = (c[x.v2] || 0) + 1;
  console.log(p, o.length, 'v2', JSON.stringify(c), 'cal exact', ex + '/' + cal.length, 'max|d|', maxd, 'bias', bias.toFixed(2), errs.length ? 'ERR ' + errs.slice(0, 6).join(' ') : 'ok', maxd > 2 ? 'RERUN' : '');
}
