import { readFileSync, writeFileSync } from 'node:fs';
const items = JSON.parse(readFileSync('data/minigame/song/items.json', 'utf8')).items;
const ents = s => s.replace(/&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
const norm = s => ents(String(s)).toLowerCase().replace(/\(.*?\)/g,'').replace(/[^\p{L}\p{N}]/gu, '');
const charts = JSON.parse(readFileSync('data/pipeline/audit/v041-raw/_work/charts.json', 'utf8'));
const out = {}; const bad = [];
for (const it of items) {
  if (!it.chart) continue;
  const l = charts[it.chart.year];
  const names = [it.title, ...it.titleVariants].map(norm);
  const hits = l.filter(r => names.some(n => n && (norm(r.t) === n || norm(r.t).includes(n) || (n.length>3 && n.includes(norm(r.t))&&norm(r.t).length>2))));
  const pick = hits.find(r => r.rank === it.chart.rank) ?? hits[0];
  out[it.id] = { rec: it.chart.year + '#' + it.chart.rank, found: hits.map(h => h.rank + ':' + ents(h.t) + '|' + ents(h.a)) };
  if (!pick || pick.rank !== it.chart.rank) bad.push(it.id + ' ' + it.chart.year + '#' + it.chart.rank + ' ' + it.title + ' | ' + it.artist + ' => ' + JSON.stringify(out[it.id].found));
}
writeFileSync('data/pipeline/audit/v041-raw/chart-verify.json', JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'bad', bad.length); console.log(bad.join('\n'));
