// web-desk/grade 받은것 검사 + 적용안 — node web-desk/grade/_check.mjs  → _합침.json · _apply.json
//   적용 규칙(찬종 2026-11-17 두 번째 결정 — 직접 30장을 매겨 보니 웹과 비슷했다: "web 판정을 그대로 따라도 되지 않을까"): 웹 등급을 그대로 쓴다(올림 · 내림 모두).
//   표본 300(web-desk/check)의 등급 4 · 5 카드도 같은 규칙으로 넣는다.
import fs from 'node:fs';
const read = (dir) => {
  const key = JSON.parse(fs.readFileSync(`web-desk/${dir}/_정답.json`, 'utf8'));
  const all = new Map(), bad = [];
  for (const f of fs.readdirSync(`web-desk/${dir}/받은것/`).sort()) {
    let t = fs.readFileSync(`web-desk/${dir}/받은것/${f}`, 'utf8').trim();
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
  return { key, all, bad };
};
const g = read('grade'), c = read('check');
const ids = Object.keys(g.key);
console.log('grade 받음', g.all.size, '/', ids.length, '· 빠짐', ids.filter(i => !g.all.has(i)).length, ids.filter(i => !g.all.has(i)).slice(0, 10), '· 덤', [...g.all.keys()].filter(i => !g.key[i]).length, '· 문제', g.bad);
const mat = {}, apply = [];
const bump = (id, now, web, why, src) => {
  (mat[now] ??= { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })[web]++;
  if (![1, 2, 3, 4, 5].includes(web)) return;
  if (web !== now) apply.push({ id: Number(id), from: now, web, to: web, why, src });
};
for (const id of ids) { const r = g.all.get(id); if (r) bump(id, g.key[id].grade_now, r.grade, r.why, 'grade'); }
for (const [id, k] of Object.entries(c.key)) { const r = c.all.get(id); if (r && k.grade_now >= 4) bump(id, k.grade_now, r.grade, r.why, 'check'); }
console.log('지금 등급(행) × 웹 등급(열 1~5) — 등급 4 · 5 전부(표본 포함)');
for (const n of [4, 5]) console.log(' ', n, '|', [1, 2, 3, 4, 5].map(x => String(mat[n]?.[x] ?? 0).padStart(4)).join(' '));
const move = {};
for (const a of apply) move[`${a.from}→${a.to}`] = (move[`${a.from}→${a.to}`] || 0) + 1;
console.log('적용안', apply.length, JSON.stringify(move));
fs.writeFileSync('web-desk/grade/_합침.json', JSON.stringify([...g.all.values()], null, 1));
fs.writeFileSync('web-desk/grade/_apply.json', JSON.stringify({ rule: '웹 등급 그대로(찬종 2026-11-17 — 직접 매긴 30장이 웹과 평균 차이 0.66 · 지금 등급과 1.14)', count: apply.length, move, items: apply }, null, 1));
