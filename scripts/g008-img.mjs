#!/usr/bin/env node
// =============================================================================
// G008 — 미니게임 그림 하나 받기 · 줄이기 (docs/18 0장 그림 규칙)
//   node scripts/g008-img.mjs <url> <game> <id> [--ext jpg|png]
//   → assets/minigame/<game>/<id>.<ext> · 긴 변 1024px 이하 · 500KB 이하(품질을 낮추며 다시) · 메타데이터 제거
//   → 표준 출력에 JSON 한 줄 { file, width, height, bytes, sourceUrl }  (image 칸에 그대로 쓴다 — license · attribution 은 따로)
//   ★ 위키미디어는 User-Agent 가 없으면 막는다 — 아래 UA 로 받는다. 받은 원본은 저장하지 않는다
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [url, game, id] = process.argv.slice(2);
const extArg = process.argv.includes('--ext') ? process.argv[process.argv.indexOf('--ext') + 1] : 'jpg';
if (!url || !game || !id) { console.error('사용법: node scripts/g008-img.mjs <url> <game> <id> [--ext jpg|png]'); process.exit(1); }
if (!['price', 'worldprice', 'photo', 'estimate', 'which', 'photoyear'].includes(game)) { console.error('★ game 이름'); process.exit(1); }
const MAX = 1024, LIMIT = 500 * 1024;
const res = await fetch(url, { headers: { 'User-Agent': 'quiz-web-minigame/1.0 (personal non-commercial; contact via repo)', Accept: 'image/*,*/*' }, redirect: 'follow' });
if (!res.ok) { console.error(`★ 받기 실패 ${res.status} ${url}`); process.exit(2); }
const buf = Buffer.from(await res.arrayBuffer());
const dir = path.join(ROOT, 'assets/minigame', game); mkdirSync(dir, { recursive: true });
let out; let q = 85;
for (;;) {
  let p = sharp(buf, { failOn: 'none' }).rotate().resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
  out = extArg === 'png' ? await p.png({ compressionLevel: 9, palette: q < 85 }).toBuffer() : await p.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  if (out.length <= LIMIT || q <= 40) break;
  q -= 10;
}
if (out.length > LIMIT) { console.error(`★ 500KB 를 넘는다 (${out.length})`); process.exit(3); }
const meta = await sharp(out).metadata();
const rel = `assets/minigame/${game}/${id}.${extArg}`;
writeFileSync(path.join(ROOT, rel), out);
console.log(JSON.stringify({ file: rel, width: meta.width, height: meta.height, bytes: out.length, sourceUrl: url }));
