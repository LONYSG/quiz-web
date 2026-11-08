import { readFileSync, readdirSync } from 'node:fs';
const dir = 'data/pipeline/audit/g040-raw/itunes/';
const items = JSON.parse(readFileSync('data/minigame/song/items.json', 'utf8')).items;
const want = process.argv.slice(2);
const cache = readdirSync(dir).map(f => JSON.parse(readFileSync(dir + f, 'utf8')));
for (const n of want) {
  const it = items.find(i => i.id === 'song-' + n);
  console.log('##', n, it.title, '|', it.artist, '| picked', it.itunes.trackId, it.itunes.trackName, '|', it.itunes.collectionName);
  const seen = new Set();
  for (const c of cache) for (const t of c.tries ?? []) for (const r of t.results ?? []) {
    if (seen.has(r.trackId) || r.trackId === it.itunes.trackId) continue;
    const a = (r.artistName + '').toLowerCase(); const ia = (it.itunes.artistName + '').toLowerCase().split(/[ &,]/)[0];
    const tn = (r.trackName + '').toLowerCase(); const it_ = (it.itunes.trackName + '').toLowerCase().replace(/\s*[\(\[].*/, '').slice(0, 8);
    if (a.includes(ia) && tn.includes(it_)) { seen.add(r.trackId); console.log('  ', r.trackId, r.trackName, '|', r.artistName, '|', r.collectionName, '|', String(r.releaseDate).slice(0, 10), r.previewUrl ? 'P' : '-'); }
  }
}
