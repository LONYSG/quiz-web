#!/usr/bin/env node
// =============================================================================
// 프롬프트 A(소재 생성)에 넣을 입력을 조립해 출력한다 (R017 작업 B-2)
//
// ★ 생성 주체는 Opus 세션이다. 그래서 이 스크립트는 API 를 호출하지 않는다.
//   ★★ **프롬프트에 붙일 입력 블록을 그대로 만들어 준다.**
//   그래야 금지 목록이 "실제로 들어갔는가" 를 눈으로 확인할 수 있다.
//
// 사용법
//   node scripts/seeds-banlist.mjs kr-language/1 [--count 10]
//   node scripts/seeds-banlist.mjs --file tmp/r017/targets.txt
// =============================================================================

import { readFile } from 'node:fs/promises';
import { banlistFor } from '../pipeline/lib/seedstore.mjs';

const args = process.argv.slice(2);
const countIdx = args.indexOf('--count');
const COUNT = countIdx >= 0 ? Number(args[countIdx + 1]) : 10;
const fileIdx = args.indexOf('--file');

let targets;
if (fileIdx >= 0) {
  targets = (await readFile(args[fileIdx + 1], 'utf8'))
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
} else {
  targets = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
}

for (const subId of targets) {
  const b = await banlistFor(subId);
  console.log('────────────────────────────────────────────────────────────');
  console.log(`[입력] subId: ${b.subId}`);
  console.log(`카테고리: ${b.path}`);
  if (b.boundary) console.log(`중분류 경계: ${b.boundary}`);
  if (b.subNote) console.log(`소분류 경계: ${b.subNote}`);
  console.log(`뽑을 개수: ${COUNT}`);
  console.log(`금지 목록 — usedSeeds (${b.usedSeeds.length}건, 이 소분류 전체 이력)`);
  if (b.usedSeeds.length === 0) console.log('  (없음)');
  for (const s of b.usedSeeds) {
    console.log(`  · ${s.subject} + ${s.aspect}  ::  ${s.knowledgePoint}`);
  }
  console.log(`금지 목록 — usedAnswers (${b.usedAnswers.length}건, 참고용·자동 금지 아님)`);
  console.log(b.usedAnswers.length ? `  ${b.usedAnswers.join(' / ')}` : '  (없음)');
}
