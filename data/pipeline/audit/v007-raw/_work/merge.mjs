// 조각 pNN.json 합치기 · 개수/순서 대조 — node merge.mjs j1 [j2 …]
import fs from 'node:fs';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v007-raw';
for (const k of process.argv.slice(2)) {
  const refs = JSON.parse(fs.readFileSync(`${RAW}/_work/${k}.refs.json`, 'utf8'));
  const parts = fs.readdirSync(RAW).filter((f) => new RegExp(`^${k}\\.p\\d+\\.json$`).test(f)).sort();
  let all = [];
  for (const f of parts) all = all.concat(JSON.parse(fs.readFileSync(`${RAW}/${f}`, 'utf8')));
  const key = (r) => (r.ref ?? r.id);
  const got = all.map(key);
  const ok = got.length === refs.length && got.every((v, i) => String(v) === String(refs[i]));
  const dupe = got.length - new Set(got).size;
  const missing = refs.filter((r) => !got.map(String).includes(String(r)));
  const c = {}; for (const r of all) c[r.verdict] = (c[r.verdict] || 0) + 1;
  console.log(k, 'parts', parts.length, 'items', all.length, '/', refs.length, 'order', ok ? 'OK' : 'MISMATCH', 'dupe', dupe, 'missing', missing.length, JSON.stringify(c));
  if (!ok) console.log(' missing:', missing.slice(0, 20).join(','));
  if (ok) fs.writeFileSync(`${RAW}/${k}.out.json`, JSON.stringify(all, null, 1));
}
