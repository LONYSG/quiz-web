#!/usr/bin/env node
// =============================================================================
// G047 D — 라이어 제시어 세트 15 쓰기(docs/18 §12 · DG-085) — 파일만 · DB 쓰기 없음
//   입력: audit/g047-raw/_work/out-liar-<theme>.json(조각 초안 → GEN 재독 고침은 FIX 표) · drop-liar-<theme>.json
//   출력: data/minigame/topics/liar-<theme>.json 15(candidate · liar true · draw false · id liar-<theme>-NNN)
//         · 옛 open 12 삭제(animal · food · job · place · instrument · sport · object · vehicle · movie-drama · character · fruit-vegetable · snack-drink)
//         · closed 세트 liar/draw 전부 false(머리 · version +1)
//         · audit/g047-dropped.json(뺀 씨앗 단어 · 사유)
// 사용: node scripts/g047-build.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const WORK = path.join(ROOT, 'data/pipeline/audit/g047-raw/_work');
const APPLY = process.argv.includes('--apply');
const TODAY = '2026-11-09';

export const THEMES = [
  ['movie', '영화·드라마'], ['character', '캐릭터'], ['celebrity', '연예인'], ['music', '음악'], ['sport', '스포츠'],
  ['brand', '브랜드'], ['animal', '동물'], ['food', '음식'], ['place', '장소'], ['object', '사물'],
  ['vehicle', '탈것'], ['job', '직업'], ['fruit', '과일·채소'], ['snack', '간식·음료'], ['instrument', '악기'],
];
const OLD_OPEN = ['animal', 'food', 'job', 'place', 'instrument', 'sport', 'object', 'vehicle', 'movie-drama', 'character', 'fruit-vegetable', 'snack-drink'];

const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
// ★ GEN 재독 고침(fool 전부 · modern 전부 · diff 3 전부를 읽고 — 되돌리기 쉽다)
const FIX = {
  object: [
    ['젓가락', (x) => { x.fool = ['포크', '이쑤시개', '집게']; }], // 숟가락 = 수저 고정 짝
    ['열쇠', (x) => { x.fool = ['카드키', '도어락', '자동차 스마트키']; }], // 자물쇠 = 고정 짝
  ],
  celebrity: [
    ['일론 머스크', null], // 정치 활동 논란(브리프 "논란 인물 X")
    ['스티브 잡스', (x) => { x.fool = ['빌 게이츠', '마크 저커버그', '젠슨 황']; }],
  ],
  music: [
    // Queen 은 한글 "퀸" 이 1글자라 name 은 Queen 그대로(변형 퀸)
    ['god', (x) => { x.variants = x.variants.filter((v) => v !== 'g.o.d'); }], // 죽은 변형(정규화가 같음)
    ['H.O.T.', (x) => { x.variants = x.variants.filter((v) => v !== 'HOT'); }],
    ['APT.', (x) => { x.variants = x.variants.filter((v) => v !== 'APT'); }],
    ['소주 한 잔', (x) => { x.variants = x.variants.filter((v) => v !== '소주 한잔'); }],
    ['멜론', (x) => { x.sub = '음악 앱'; }],
    ['워터밤', (x) => { x.sub = '음악 축제'; }],
  ],
};
const applyFix = (slug, raw) => {
  let a = raw;
  for (const [name, fn] of FIX[slug] ?? []) {
    const i = a.findIndex((x) => x.name === name);
    if (i < 0) throw new Error(`FIX 없음 ${slug}:${name}`);
    if (fn === null) a = a.filter((_, k) => k !== i); else fn(a[i]);
  }
  return a;
};
const out = []; const dropped = {};
for (const [slug, nameKo] of THEMES) {
  const src = path.join(WORK, `out-liar-${slug}.json`);
  if (!existsSync(src)) throw new Error(`없음: ${src}`);
  const raw = applyFix(slug, rd(src));
  const items = raw.map((x, i) => ({
    id: `liar-${slug}-${String(i + 1).padStart(3, '0')}`,
    name: x.name.trim(),
    variants: (x.variants ?? []).map((v) => v.trim()).filter(Boolean),
    tags: [x.sub.trim()],
    sub: x.sub.trim(),
    era: x.era,
    diff: x.diff,
    fool: x.fool.map((f) => f.trim()),
    draw: false,
    liar: true,
    qid: null,
  }));
  out.push({
    topic: `liar-${slug}`, nameKo, kind: 'open', version: 1, asOf: TODAY, createdRound: 'G047', status: 'candidate',
    source: [{ url: 'https://toz-app.com/ko/blog/party-games/imposter-game-words', note: '씨앗 toz(라이어 제시어 6 페이지 · 쌍 961 — 참고) + 옛 open 세트(G036 · G044) + GEN 2026 · 단어마다 보편성 · 게임성으로 다시 골라 재생성(18 §12) · 바보형 fool 은 우리가 새로 짬', fetchedAt: TODAY, read: true }],
    liar: true, draw: false, timeSec: 30, tags: ['라이어', nameKo], count: items.length, items, verify: null,
  });
  const dp = path.join(WORK, `drop-liar-${slug}.json`);
  dropped[`liar-${slug}`] = existsSync(dp) ? rd(dp) : [];
}

// closed 태그 끔
const closedOff = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const t = rd(path.join(DIR, f));
  if (t.kind !== 'closed') continue;
  const l = t.items.filter((i) => i.liar).length; const d = t.items.filter((i) => i.draw).length;
  if (!l && !d && !t.liar && !t.draw) continue;
  for (const it of t.items) { it.liar = false; it.draw = false; }
  t.liar = false; t.draw = false; t.version += 1;
  closedOff.push({ topic: t.topic, liarBefore: l, drawBefore: d, version: t.version });
  if (APPLY) writeFileSync(path.join(DIR, f), JSON.stringify(t, null, 1) + '\n');
}

for (const t of out) {
  const e = t.items.reduce((m, i) => ((m[i.era] = (m[i.era] ?? 0) + 1), m), {});
  const df = t.items.reduce((m, i) => ((m[i.diff] = (m[i.diff] ?? 0) + 1), m), {});
  console.log(t.topic.padEnd(18), 'n', t.count, 'era', JSON.stringify(e), 'diff', JSON.stringify(df), 'drop', dropped[t.topic].length);
  if (APPLY) writeFileSync(path.join(DIR, `${t.topic}.json`), JSON.stringify(t, null, 1) + '\n');
}
console.log('closed 끔', closedOff.map((c) => `${c.topic}(${c.liarBefore}/${c.drawBefore})`).join(' '));
if (APPLY) {
  for (const s of OLD_OPEN) { const p = path.join(DIR, `${s}.json`); if (existsSync(p)) unlinkSync(p); }
  const total = Object.values(dropped).reduce((n, a) => n + a.length, 0);
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g047-dropped.json'), JSON.stringify({ round: 'G047', total, closedOff, sets: dropped }, null, 1) + '\n');
  console.log('적용 · 옛 open 12 삭제 · audit/g047-dropped.json');
} else console.log('dry-run (--apply 로 씀)');
