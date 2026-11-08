// V041 — previewUrl HEAD 293 (3초 간격) → head.json. 재시작 시 이어서.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const out = 'data/pipeline/audit/v041-raw/head.json';
const items = JSON.parse(readFileSync('data/minigame/song/items.json', 'utf8')).items;
const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
for (const it of items) {
  if (res[it.id]) continue;
  try {
    const r = await fetch(it.itunes.previewUrl, { method: 'HEAD', headers: { 'User-Agent': 'quiz-web-v041/1.0' } });
    res[it.id] = { status: r.status, type: r.headers.get('content-type'), len: r.headers.get('content-length') };
  } catch (e) { res[it.id] = { status: 0, err: String(e.message ?? e) }; }
  writeFileSync(out, JSON.stringify(res));
  await new Promise((r) => setTimeout(r, 3000));
}
console.log('done', Object.keys(res).length);
