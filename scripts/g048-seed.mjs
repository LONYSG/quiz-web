#!/usr/bin/env node
// =============================================================================
// G048 A — 캐치마인드 제시어 씨앗 파서(docs/18 §12) — 파일만 · DB 없음
//   나무위키 "캐치마인드/문제 목록"(CC BY-NC-SA 2.0 KR — 씨앗으로만 · 원문은 audit 에만) — audit/g048-raw/seed/namu.html
//   줄 꼴 ".ㄱㅂ = 가발·가방·…"(<br> 로 줄 · ? 꼬리 = 불확실) → seed.json {word, len, chosung, uncertain}
//   + 옛 proverb · idiom4(G044) 단어
// 사용: node scripts/g048-seed.mjs   (받기: curl → audit/g048-raw/seed/namu.html)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data/pipeline/audit/g048-raw/seed');
const html = readFileSync(path.join(SEED, 'namu.html'), 'utf8');
const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const words = new Map();
let cur = null; // ★ 줄이 길면 다음 줄로 이어진다(앞에 .ㄱㄱ = 없음) — 직전 초성에 붙임
for (const raw of text.split('\n')) {
  const line = raw.trim();
  if (!line || line === '&nbsp;') continue;
  let m = line.match(/^\.([ㄱ-ㅎ]+)\s*=\s*(.+)$/);
  if (m) cur = m[1];
  else if (cur && !/=/.test(line) && /^[가-힣0-9A-Za-z]/.test(line) && /[·?]/.test(line) && line.length <= 400) m = [line, cur, line];
  else { cur = null; continue; }
  // "가구? 경고" 처럼 ? 뒤 빈칸으로 이어진 꼴도 나눈다
  for (let w of m[2].replace(/\?\s+/g, '?·').split('·')) {
    w = w.trim().replace(/\[\d+\]$/, '');
    if (!w) continue;
    const uncertain = /\?$/.test(w);
    const word = w.replace(/\?+$/, '').trim();
    if (!word) continue;
    if (!words.has(word)) words.set(word, { word, len: [...word.replace(/\s/g, '')].length, chosung: m[1], uncertain });
  }
}
const list = [...words.values()];
const len = {}; for (const x of list) { const k = x.len >= 6 ? '6+' : String(x.len); len[k] = (len[k] ?? 0) + 1; }
const ours = [];
for (const slug of ['proverb', 'idiom4']) {
  const p = path.join(ROOT, 'data/minigame/topics', `${slug}.json`);
  if (existsSync(p)) for (const it of JSON.parse(readFileSync(p, 'utf8')).items) ours.push({ id: it.id, word: it.name, variants: it.variants, topic: slug });
}
const out = {
  fetchedAt: '2026-11-09', source: 'https://namu.wiki/w/캐치마인드/문제 목록', license: 'CC BY-NC-SA 2.0 KR — 씨앗으로만(우리 파일은 우리가 고른 단어 + 우리 태그 · DATA_LICENSE.md)',
  count: list.length, uncertain: list.filter((x) => x.uncertain).length, len, ours: ours.length, words: list, oursWords: ours,
};
writeFileSync(path.join(SEED, 'seed.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ count: out.count, uncertain: out.uncertain, len, ours: ours.length }));
