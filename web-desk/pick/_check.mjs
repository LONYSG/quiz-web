// web-desk/pick 받은것 검사 — node web-desk/pick/_check.mjs  → _합침.json · _swap.json
import fs from 'node:fs';
const key = JSON.parse(fs.readFileSync('web-desk/pick/_정답.json', 'utf8'));
const d = 'web-desk/pick/받은것/';
const all = new Map();
const bad = [];
for (const f of fs.readdirSync(d).sort()) {
  let t = fs.readFileSync(d + f, 'utf8').trim();
  if (!t) { bad.push(f + ' 빔'); continue; }
  t = t.replace(/```json/g, '').replace(/```/g, '').trim();
  let blocks = [];
  try { blocks = [JSON.parse(t)]; }
  catch {
    try { blocks = t.split(/\n(?=\{\s*"chunk")/).map(p => JSON.parse(p)); }
    catch (e) { bad.push(f + ' 형식 ' + e.message.slice(0, 80)); continue; }
  }
  for (const b of blocks) for (const r of b.results || []) {
    if (all.has(r.key)) bad.push('겹침 ' + r.key);
    all.set(r.key, { ...r, file: f });
  }
}
const keys = Object.keys(key);
const miss = keys.filter(k => !all.has(k));
const extra = [...all.keys()].filter(k => !key[k]);
let keep = 0, nul = 0, inval = 0;
const flags = {}, swaps = [];
for (const [k, v] of Object.entries(key)) {
  const r = all.get(k);
  if (!r) continue;
  if (r.flag) flags[r.flag] = (flags[r.flag] || 0) + 1;
  if (r.keep == null) { nul++; continue; }
  if (!v.ids.includes(r.keep)) { inval++; bad.push(`없는 id ${k} ${r.keep}`); continue; }
  if (r.keep === v.kept_g097) keep++;
  else swaps.push({ key: k, on: r.keep, off: v.kept_g097, ids: v.ids, why: r.why, flag: r.flag || null });
}
console.log('받음', all.size, '/', keys.length, '· 빠짐', miss.length, miss.slice(0, 10), '· 덤', extra.length, '· 문제', bad);
console.log({ keep, swap: swaps.length, nul, inval, flags });
for (const k of ['S0537', 'S0800', 'S0173', 'S0439', 'S0745']) console.log(k, JSON.stringify(all.get(k)), 'g097:', key[k]?.kept_g097);
fs.writeFileSync('web-desk/pick/_합침.json', JSON.stringify([...all.values()], null, 1));
fs.writeFileSync('web-desk/pick/_swap.json', JSON.stringify(swaps, null, 1));
