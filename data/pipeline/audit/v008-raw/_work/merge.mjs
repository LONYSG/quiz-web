// node merge.mjs <piece> — pNN 을 합쳐 refs 와 대조 (개수·순서·중복·형식)
import fs from 'node:fs';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
for (const k of process.argv.slice(2)) {
  const refs = JSON.parse(fs.readFileSync(`${R}/_work/${k}.refs.json`, 'utf8'));
  const files = fs.readdirSync(R).filter((f) => f.startsWith(k + '.p') && f.endsWith('.json') && /\.p\d+\.json$/.test(f)).sort();
  let all = []; for (const f of files) all = all.concat(JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8')));
  const keys = all.map((x) => String(x.key));
  const miss = refs.filter((r) => !keys.includes(r)), extra = keys.filter((r) => !refs.includes(r));
  const dup = keys.filter((r, i) => keys.indexOf(r) !== i);
  const orderOk = keys.length === refs.length && keys.every((r, i) => r === refs[i]);
  const bad = all.filter((x) => !['ok', 'fix'].includes(x.verdict) || !x.reason);
  const cnt = {}; for (const x of all) cnt[x.verdict] = (cnt[x.verdict] || 0) + 1;
  console.log(k, { files: files.length, n: all.length, refs: refs.length, miss: miss.length, extra: extra.length, dup: dup.length, orderOk, bad: bad.length, verdict: cnt });
  if (miss.length) console.log(' miss', miss.slice(0, 20));
  if (!miss.length && !extra.length && !dup.length) {
    // 입력 순서로 재배열
    const by = new Map(all.map((x) => [String(x.key), x]));
    fs.writeFileSync(`${R}/${k}.out.json`, JSON.stringify(refs.map((r) => by.get(r)), null, 1));
  }
}
