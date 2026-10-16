import fs from 'node:fs';
const R = 'C:/work/quiz-web/data/pipeline/audit/v010-raw';
for (const k of process.argv.slice(2)) {
  const refs = JSON.parse(fs.readFileSync(`${R}/_work/${k}.refs.json`, 'utf8'));
  const f = `${R}/${k}.out.json`; if (!fs.existsSync(f)) { console.log(k, 'no out'); continue; }
  const all = JSON.parse(fs.readFileSync(f, 'utf8')); const keys = all.map((x) => String(x.id));
  const miss = refs.filter((r) => !keys.includes(r)), extra = keys.filter((r) => !refs.includes(r)), dup = keys.filter((r, i) => keys.indexOf(r) !== i);
  const bad = all.filter((x) => ![1, 2, 3, 4, 5].includes(x.dif) || !x.easiestCue || !x.difWhy);
  const dif = {}; for (const x of all) dif[x.dif] = (dif[x.dif] || 0) + 1;
  console.log(k, { n: all.length, refs: refs.length, miss: miss.length, extra: extra.length, dup: dup.length, orderOk: keys.every((r, i) => r === refs[i]), bad: bad.length, dif, edge: all.filter((x) => x.edge).length, note: all.filter((x) => x.note).length });
}
