#!/usr/bin/env node
// =============================================================================
// 채점 기준표 동기화 — 기준서 5장을 프롬프트에 **글자 그대로** 넣는다 (R024)
//
// ★★ 왜: R023 에서 question-v1·v2 의 알 가치 정의가 D-053 이전 축으로 퇴행해 있었다 (D-107).
//   원인은 기준을 사람이 손으로 옮겨 적은 것이다. 옮겨 적으면 언젠가 갈라진다.
//   → 정본(docs/15-QUALITY-STANDARD.md 5-1~5-3)을 잘라 프롬프트의 표시 구간에 넣는다.
//
// 표시 구간:  <!-- CRITERIA:BEGIN -->  …  <!-- CRITERIA:END -->
//
// 사용법
//   node scripts/criteria-sync.mjs           프롬프트를 고친다
//   node scripts/criteria-sync.mjs --check   다르면 exit 1 (고치지 않는다)
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const STANDARD = 'docs/15-QUALITY-STANDARD.md';
const TARGETS = ['pipeline/prompts/score-v1.md', 'pipeline/prompts/question-v3.md'];
const BEGIN = '<!-- CRITERIA:BEGIN -->';
const END = '<!-- CRITERIA:END -->';

export function extractCriteria(md) {
  const a = md.indexOf('### 5-1.');
  const b = md.indexOf('### 5-4.');
  if (a < 0 || b < 0) throw new Error('기준서에서 5-1 ~ 5-4 를 찾지 못했다');
  return md.slice(a, b).trim();
}

const criteria = extractCriteria(readFileSync(STANDARD, 'utf8'));
const CHECK = process.argv.includes('--check');
let bad = 0;
for (const t of TARGETS) {
  const s = readFileSync(t, 'utf8');
  const i = s.indexOf(BEGIN), j = s.indexOf(END);
  if (i < 0 || j < 0) { console.error(`★ 표시 구간 없음: ${t}`); bad += 1; continue; }
  const cur = s.slice(i + BEGIN.length, j).trim();
  if (cur === criteria) { console.log(`[같음] ${t}`); continue; }
  if (CHECK) { console.error(`★ 다름: ${t}`); bad += 1; continue; }
  writeFileSync(t, s.slice(0, i + BEGIN.length) + '\n' + criteria + '\n' + s.slice(j), 'utf8');
  console.log(`[고침] ${t}`);
}
if (bad) process.exit(1);
