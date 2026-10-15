import fs from 'node:fs';
const R = 'C:/work/quiz-web/data/pipeline/audit/v009-raw';
for (const k of process.argv.slice(2)) {
  const refs = JSON.parse(fs.readFileSync(`${R}/_work/${k}.refs.json`, 'utf8'));
  const files = fs.readdirSync(R).filter((f) => f.startsWith(k + '.p') && /\.p\d+\.json$/.test(f)).sort();
  let all = []; for (const f of files) all = all.concat(JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8')));
  const keys = all.map((x) => String(x.ref));
  const miss = refs.filter((r) => !keys.includes(r)), extra = keys.filter((r) => !refs.includes(r)), dup = keys.filter((r, i) => keys.indexOf(r) !== i);
  const bad = all.filter((x) => !['ok', 'fix', 'drop', 'unsure'].includes(x.verdict) || !x.reason || !x.score || !x.score.dif);
  const cnt = {}; for (const x of all) cnt[x.verdict] = (cnt[x.verdict] || 0) + 1;
  const dif = {}; for (const x of all) dif[x.score?.dif] = (dif[x.score?.dif] || 0) + 1;
  console.log(k, { files: files.length, n: all.length, refs: refs.length, miss: miss.length, extra: extra.length, dup: dup.length, bad: bad.length, verdict: cnt, dif });
  if (!miss.length && !extra.length && !dup.length) { const by = new Map(all.map((x) => [String(x.ref), x])); fs.writeFileSync(`${R}/${k}.out.json`, JSON.stringify(refs.map((r) => by.get(r)), null, 1)); }
}
