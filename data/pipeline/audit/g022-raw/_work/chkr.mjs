import fs from 'node:fs';
for (const p of process.argv.slice(2)) { let o; try { o = JSON.parse(fs.readFileSync(p + '.out.json', 'utf8')); } catch (e) { console.log(p, 'PARSE FAIL'); continue; }
  const k = JSON.parse(fs.readFileSync(p + '.keys.json', 'utf8')); const c = {}; for (const x of o) c[x.verdict] = (c[x.verdict] || 0) + 1;
  const bad = o.filter((x) => !['ok', 'fix', 'reject'].includes(x.verdict) || (x.verdict === 'fix' && !x.fixText) || !['yes', 'same', 'no'].includes(x.easier));
  console.log(p, o.length + '/' + k.length, 'order', o.every((x, i) => String(x.id) === k[i]), JSON.stringify(c), 'leak', o.filter((x) => x.leak).length, 'fact', o.filter((x) => x.factChange).length, 'bad', bad.length); }
