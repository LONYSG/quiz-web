#!/usr/bin/env node
// =============================================================================
// G016 — 미니게임 그림 잘라 내기 (워터마크 · 서명 · 글자 · 배지 · 다른 대상 빼기 — V012 · V017 그림 문제)
//   node scripts/g016-crop.mjs <assets/minigame/…/파일> <left> <top> <width> <height>
//   ★ 처음 부를 때 원본을 tmp/g016/orig/ 에 둔다 → 다시 불러도 늘 원본에서 자른다(멱등)
//   → 같은 파일 이름으로 jpg 저장(긴 변 1024 · 500KB 이하) · 표준 출력에 { file, width, height, bytes }
// =============================================================================
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [rel, ...box] = process.argv.slice(2);
const [left, top, width, height] = box.map(Number);
if (!rel || !/^assets\/minigame\/[a-z]+\/[A-Za-z0-9_-]+\.jpg$/.test(rel) || [left, top, width, height].some((n) => !Number.isInteger(n))) {
  console.error('사용법: node scripts/g016-crop.mjs <assets/minigame/<game>/<id>.jpg> <left> <top> <width> <height>');
  process.exit(1);
}
const src = path.join(ROOT, rel);
const orig = path.join(ROOT, 'tmp/g016/orig', rel.replace(/\//g, '__'));
mkdirSync(path.dirname(orig), { recursive: true });
if (!existsSync(orig)) copyFileSync(src, orig);
const buf = readFileSync(orig);
let out;
for (let q = 88; ; q -= 8) {
  out = await sharp(buf).extract({ left, top, width, height }).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  if (out.length <= 500 * 1024 || q <= 40) break;
}
writeFileSync(src, out);
const m = await sharp(out).metadata();
console.log(JSON.stringify({ file: rel, width: m.width, height: m.height, bytes: out.length }));
