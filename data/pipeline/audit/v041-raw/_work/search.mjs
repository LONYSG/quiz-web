import { writeFileSync, existsSync, readFileSync } from 'node:fs';
const out = 'data/pipeline/audit/v041-raw/search-cache.json';
const cache = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
for (const term of process.argv.slice(2)) {
  if (!cache[term]) {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=US&media=music&entity=song&limit=8`, { headers: { 'User-Agent': 'quiz-web-v041/1.0' } });
    cache[term] = r.ok ? (await r.json()).results.map(x => ({ id: x.trackId, t: x.trackName, a: x.artistName, c: x.collectionName, rd: x.releaseDate?.slice(0, 10), p: !!x.previewUrl })) : { err: r.status };
    writeFileSync(out, JSON.stringify(cache));
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('##', term); for (const x of [].concat(cache[term])) console.log('  ', x.id, x.t, '|', x.a, '|', x.c, '|', x.rd, x.p ? 'P' : '-');
}
