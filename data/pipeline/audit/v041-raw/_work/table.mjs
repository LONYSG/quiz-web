import { readFileSync, writeFileSync } from 'node:fs';
const items = JSON.parse(readFileSync('data/minigame/song/items.json', 'utf8')).items;
const amb = JSON.parse(readFileSync('data/pipeline/audit/g040-raw/result.json', 'utf8')).ambiguous;
const ak = new Set(amb.map(a => a.title + '|' + a.artist));
const rows = items.map(i => ({ id: i.id, w: ak.has(i.title + '|' + i.artist) ? 'W' : 'S', pool: i.pool, title: i.title, tv: i.titleVariants, artist: i.artist, av: i.artistVariants, year: i.year,
  tn: i.itunes.trackName, an: i.itunes.artistName, cn: i.itunes.collectionName, rd: i.itunes.releaseDate.slice(0, 10), chart: i.chart ? i.chart.year + '#' + i.chart.rank : null }));
writeFileSync('data/pipeline/audit/v041-raw/_work/rows.json', JSON.stringify(rows));
console.log(rows.filter(r => r.w === 'W').length);
