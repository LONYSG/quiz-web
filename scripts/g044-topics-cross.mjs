#!/usr/bin/env node
// =============================================================================
// G044 — 주제 세트 **사이** 겹침 검사(topics-check 는 세트 안만 본다 · 18 §9 제시어 풀 원칙)
//   모든 topics/*.json 의 name · variants 를 flexCanon 으로 모아, 서로 다른 세트에 같은 canon 이 있으면 적는다
//   기본: 한쪽이라도 --new 에 든 세트인 겹침만(새 세트 점검용) · --all 이면 전부
//   결과 → data/pipeline/audit/g044-cross.json
// 사용: node scripts/g044-topics-cross.mjs [--new a,b,c] [--all]
// =============================================================================
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const NEW = new Set((arg('--new') ?? 'object,vehicle,movie-drama,character,fruit-vegetable,snack-drink,proverb,idiom4').split(','));
const ALL = process.argv.includes('--all');

const map = new Map(); // canon → [{topic, id, name, via}]
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const t = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
  for (const it of t.items) {
    for (const [s, via] of [[it.name, 'name'], ...(it.variants ?? []).map((v) => [v, 'variant'])]) {
      const c = flexCanon(s);
      if (!c) continue;
      if (!map.has(c)) map.set(c, []);
      map.get(c).push({ topic: t.topic, id: it.id, name: it.name, via, text: s, liar: !!it.liar, draw: !!it.draw });
    }
  }
}
const hits = [];
for (const [canon, list] of map) {
  const topics = new Set(list.map((x) => x.topic));
  if (topics.size < 2) continue;
  if (!ALL && !list.some((x) => NEW.has(x.topic))) continue;
  hits.push({ canon, list });
}
hits.sort((a, b) => a.canon.localeCompare(b.canon));
for (const h of hits) console.log(h.canon.padEnd(14), h.list.map((x) => `${x.topic}:${x.name}${x.via === 'variant' ? `(변형 ${x.text})` : ''}${x.liar ? ' L' : ''}${x.draw ? ' D' : ''}`).join(' ↔ '));
console.log(`[g044-cross] 겹침 ${hits.length}${ALL ? ' (전부)' : ' (새 세트 관련)'}`);
writeFileSync(path.join(ROOT, 'data/pipeline/audit/g044-cross.json'), JSON.stringify({ round: 'G044', all: ALL, newSets: [...NEW], count: hits.length, hits }, null, 1) + '\n');
