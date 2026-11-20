#!/usr/bin/env node
// =============================================================================
// ★★ R110 — 공식 로고(docs/design/logo/quizdojang-logo.svg)에서 파비콘 · 앱 아이콘을 뽑는다
//   node scripts/logo-icons.mjs   → client/public/favicon.svg · favicon-32.png · apple-touch-icon.png(180) · icon-192.png · icon-512.png
//   ★ 좌표 · 색은 svg 그대로. 32px 이하(favicon)만 안쪽 흰 테두리 12 → 20(작으면 뭉개진다 — BrandLogo.tsx 와 같은 규칙).
//   ★ png 는 이 PC 의 Chrome(headless --screenshot)으로 그린다 · 바탕 투명.
//   로고를 바꾸면 이 스크립트를 다시 돌리고 png 를 커밋한다.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs/design/logo/quizdojang-logo.svg');
const OUT = path.join(ROOT, 'client/public');
const svg = readFileSync(SRC, 'utf8');
const small = svg.replace('stroke-width="12"', 'stroke-width="20"');
if (small === svg) throw new Error('로고 svg 에서 안쪽 테두리(stroke-width="12")를 못 찾았다 — 로고가 바뀌었으면 이 스크립트 · BrandLogo.tsx 를 함께 본다');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', process.env.CHROME_PATH]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome 을 못 찾았다(CHROME_PATH 로 알려 준다)');

writeFileSync(path.join(OUT, 'favicon.svg'), small);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'logo-'));
try {
  for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    const html = path.join(tmp, `${size}.html`);
    const body = size <= 32 ? small : svg;
    writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${body.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    const out = path.join(OUT, name);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${out}`, `file:///${html.replace(/\\/g, '/')}`], { stdio: 'ignore' });
    if (!existsSync(out)) throw new Error(`${name} 를 못 만들었다`);
    console.log(`[logo] ${path.relative(ROOT, out)} (${size}px)`);
  }
  console.log(`[logo] ${path.relative(ROOT, path.join(OUT, 'favicon.svg'))}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
