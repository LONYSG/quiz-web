import { readFileSync, writeFileSync } from 'node:fs';
const items = JSON.parse(readFileSync('data/minigame/song/items.json', 'utf8')).items;
const norm = s => String(s).toLowerCase().replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/[^\p{L}\p{N}]/gu, '');
const charts = {};
for (let y = 2005; y <= 2025; y++) {
  const h = readFileSync(`data/pipeline/audit/v041-raw/melon/${y}.html`, 'utf8');
  const rows = h.split('<tr').slice(1);
  const list = [];
  for (const r of rows) {
    const rank = r.match(/class="rank">(\d+)</) || r.match(/<span class="rank[^"]*">\s*(\d+)/);
    const t = r.match(/class="ellipsis rank01">[\s\S]*?<a [^>]*>([^<]*)<\/a>/);
    const a = r.match(/class="ellipsis rank02"><a [^>]*>([^<]*)<\/a>/);
    if (t && a) list.push({ rank: list.length + 1, rk: rank?.[1], t: t[1].trim(), a: a[1].trim() });
  }
  charts[y] = list;
}
writeFileSync('data/pipeline/audit/v041-raw/_work/charts.json', JSON.stringify(charts));
console.log(Object.entries(charts).map(([y, l]) => y + ':' + l.length).join(' '));
const bad = [];
for (const it of items) {
  if (!it.chart) continue;
  const l = charts[it.chart.year]; const row = l?.[it.chart.rank - 1];
  const okT = row && (norm(row.t).includes(norm(it.title)) || norm(it.title).includes(norm(row.t)) || it.titleVariants.some(v => norm(row.t).includes(norm(v))));
  const okA = row && (norm(row.a).includes(norm(it.artist)) || norm(it.artist).includes(norm(row.a)) || it.artist.split(/[, ]/).some(p => p && norm(row.a).includes(norm(p))) || it.artistVariants.some(v => norm(row.a).includes(norm(v))));
  if (!okT || !okA) bad.push([it.id, it.chart.year + '#' + it.chart.rank, it.title, '|', it.artist, ' <=> ', row?.t, '|', row?.a].join(' '));
}
console.log(bad.length); console.log(bad.join('\n'));
