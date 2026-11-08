import { readFileSync, writeFileSync } from 'node:fs';
const w = readFileSync('data/pipeline/audit/v041-raw/us-states-ko.wiki', 'utf8');
const rows = [...w.matchAll(/^\| \[\[([^\]|]+?)\]\] \|\| ([^|]+?) \|\| (\w\w) \|\|.*?\|\| (\d{4})-(\d\d)-(\d\d) \|\|/gm)].map(m => ({ name: m[1], en: m[2].trim(), ab: m[3], year: +m[4] }));
const t = JSON.parse(readFileSync('data/minigame/topics/us-state.json', 'utf8'));
console.log('page rows', rows.length);
const bad = [];
t.items.forEach((it, i) => { const r = rows[i]; if (!r || r.name !== it.name || r.year !== it.year) bad.push([it.id, it.name, it.year, '<=>', r?.name, r?.year].join(' ')); });
console.log('mismatch', bad.length, bad);
const pn = new Set(rows.map(r => r.name)), fn = new Set(t.items.map(i => i.name));
console.log('missing', [...pn].filter(x => !fn.has(x)), 'extra', [...fn].filter(x => !pn.has(x)));
// 변형 겹침/중복
const all = new Map(); const dup = [];
for (const it of t.items) {
  const own = [it.name, ...it.variants];
  if (new Set(own).size !== own.length) dup.push(it.id + ' 자기 중복 ' + own.join('/'));
  for (const s of own) { const k = s.replace(/주$/, ''); if (all.has(k) && all.get(k) !== it.id && s !== it.name) dup.push(`${it.id} ${s} ↔ ${all.get(k)}`); if (!all.has(k)) all.set(k, it.id); }
}
console.log('variant issues', dup);
// 지역 태그 — 미 인구조사국 4 지역
const REG = { 북동부: 'CT ME MA NH RI VT NJ NY PA', 중서부: 'IL IN IA KS MI MN MO NE ND OH SD WI', 남부: 'DE FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX', 서부: 'AZ CO ID MT NV NM UT WY AK CA HI OR WA' };
const tag = {}; for (const [k, v] of Object.entries(REG)) for (const a of v.split(' ')) tag[a] = k;
const tb = []; t.items.forEach((it, i) => { const r = rows[i]; if (r && !it.tags.includes(tag[r.ab])) tb.push(it.name + ' ' + it.tags + ' ≠ ' + tag[r.ab]); });
console.log('tag mismatch', tb);
console.log('qid', t.items.filter(i => i.qid).map(i => i.id + ' ' + i.name + ' ' + i.qid));
writeFileSync('data/pipeline/audit/v041-raw/usstate-compare.json', JSON.stringify({ rows: rows.length, bad, dup, tb }, null, 1));
