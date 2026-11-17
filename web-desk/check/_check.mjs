// web-desk/check 받은것 검사 — node web-desk/check/_check.mjs  → _합침.json
import fs from 'node:fs';
const key = JSON.parse(fs.readFileSync('web-desk/check/_정답.json', 'utf8'));
const d = 'web-desk/check/받은것/';
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
  for (const b of blocks) for (const r of b.results || []) { if (all.has(String(r.id))) bad.push('겹침 ' + r.id); all.set(String(r.id), r); }
}
const ids = Object.keys(key);
console.log('받음', all.size, '/', ids.length, '· 빠짐', ids.filter(i => !all.has(i)).length, '· 덤', [...all.keys()].filter(i => !key[i]).length, '· 문제', bad);
const tid = { n: 0, by: {} }, mat = {}, diff = {};
let same = 0, up = 0, down = 0, n = 0;
const tidbits = [];
for (const id of ids) {
  const r = all.get(id); if (!r) continue;
  const g0 = key[id].grade_now, g1 = r.grade;
  n++;
  tid.by[g0] ??= { n: 0, t: 0 }; tid.by[g0].n++;
  if (r.q === 'tidbit') { tid.n++; tid.by[g0].t++; tidbits.push(id); }
  (mat[g0] ??= { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })[g1]++;
  const dd = g1 - g0; diff[dd] = (diff[dd] || 0) + 1;
  if (dd === 0) same++; else if (dd > 0) up++; else down++;
}
console.log('tidbit', tid.n, '/', n, '· 지금 등급별', JSON.stringify(tid.by));
console.log('난이도 — 같음', same, '· 웹이 더 어렵게', up, '· 더 쉽게', down, '· 차이 분포', JSON.stringify(diff));
console.log('지금 등급(행) × 웹 등급(열 1~5)');
for (const g of [1, 2, 3, 4, 5]) console.log(' ', g, '|', [1, 2, 3, 4, 5].map(x => String(mat[g]?.[x] ?? 0).padStart(3)).join(' '));
console.log('tidbit ids', tidbits.join(' '));
fs.writeFileSync('web-desk/check/_합침.json', JSON.stringify([...all.values()], null, 1));
