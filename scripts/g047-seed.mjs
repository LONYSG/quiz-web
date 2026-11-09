#!/usr/bin/env node
// =============================================================================
// G047 B — 라이어 제시어 씨앗 파서(docs/18 §12) — 파일만 · DB 없음
//   toz-app 라이어 게임 제시어 6 페이지(audit/g047-raw/seed/toz-*.html — 표 <td> 두 칸 = 시민 / 임포스터 · 표 앞 h2/h3 = 소주제)
//   + 우리 open 세트(data/minigame/topics kind open — 단어 · 세트)
//   → audit/g047-raw/seed/seed.json { fetchedAt, license, toz:[{citizen, imposter, page, section}], ours:[{word, topic}], dup }
//   라이선스 메모: toz = 참고 · 재구성(그대로 쓰지 않음) / 우리 open 세트 = 우리 것
// 사용: node scripts/g047-seed.mjs
// =============================================================================
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data/pipeline/audit/g047-raw/seed');
const TOPICS = path.join(ROOT, 'data/minigame/topics');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const toz = [];
const perPage = {};
for (const f of readdirSync(SEED).filter((x) => /^toz-.*\.html$/.test(x)).sort()) {
  const html = readFileSync(path.join(SEED, f), 'utf8');
  const page = f.replace(/^toz-|\.html$/g, '');
  // h2/h3 와 table 을 순서대로
  const re = /<(h2|h3)[^>]*>([\s\S]*?)<\/\1>|<table[\s\S]*?<\/table>/g;
  let section = null; let m; let n = 0;
  while ((m = re.exec(html))) {
    if (m[1]) { section = strip(m[2]); continue; }
    const rows = m[0].match(/<tr[\s\S]*?<\/tr>/g) ?? [];
    for (const r of rows) {
      const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => strip(x[1]));
      if (tds.length !== 2 || !tds[0] || !tds[1]) continue;
      toz.push({ citizen: tds[0], imposter: tds[1], page, section }); n += 1;
    }
  }
  perPage[page] = n;
}
const ours = [];
for (const f of readdirSync(TOPICS).filter((x) => x.endsWith('.json')).sort()) {
  const t = JSON.parse(readFileSync(path.join(TOPICS, f), 'utf8'));
  if (t.kind !== 'open') continue;
  for (const it of t.items) ours.push({ word: it.name, topic: t.topic, variants: it.variants });
}
const tozCanon = new Map();
for (const p of toz) for (const w of [p.citizen, p.imposter]) tozCanon.set(flexCanon(w), w);
const dup = ours.filter((o) => tozCanon.has(flexCanon(o.word))).map((o) => ({ word: o.word, topic: o.topic }));
const uniqCitizen = new Set(toz.map((p) => flexCanon(p.citizen))).size;
const out = {
  fetchedAt: '2026-11-09',
  license: 'toz-app.com 블로그 표 = 참고 자료(쌍 · 분류는 우리가 다시 짬 · 그대로 쓰지 않음) / 우리 open 세트 = 우리 것(G036 · G044)',
  source: Object.keys(perPage).map((p) => `https://toz-app.com/ko/blog/party-games/${p}`),
  perPage, tozPairs: toz.length, tozUniqueCitizen: uniqCitizen, oursWords: ours.length, dupCount: dup.length,
  toz, ours, dup,
};
writeFileSync(path.join(SEED, 'seed.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ perPage, tozPairs: toz.length, uniqCitizen, ours: ours.length, dup: dup.length }));
