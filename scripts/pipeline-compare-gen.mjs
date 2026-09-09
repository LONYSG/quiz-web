#!/usr/bin/env node
// =============================================================================
// Gemini vs Claude Code 생성 비교 — Gemini 측 생성 (R012 작업 A)
//
// ★★ 왜 별도 스크립트인가
//   비교 실험은 **양쪽이 정확히 같은 슬롯**을 받아야 한다.
//   pipeline:generate 는 카테고리 트리에서 자동으로 소분류를 뽑으므로
//   ★ 조건을 고정할 수 없다. 그래서 슬롯 목록을 파일에서 읽는다.
//
// ★ 프롬프트는 g3 그대로 쓴다. 어느 한쪽에 유리하게 다시 쓰지 않는다 (지시).
//
// 사용법
//   node scripts/pipeline-compare-gen.mjs                 기본 (data/pipeline/compare-slots.json)
//   node scripts/pipeline-compare-gen.mjs --per 5          슬롯당 건수
//   node scripts/pipeline-compare-gen.mjs --group 3        한 호출에 넣을 소분류 수
//   node scripts/pipeline-compare-gen.mjs --plan           슬롯 목록만 보고 끝낸다
// =============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS, LIMITS, MODELS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient } from '../pipeline/dist/gemini.js';
import { findMajor, findMid } from '../pipeline/dist/categories.js';
import { generateBatch, GEN_SOURCE_ID } from '../pipeline/dist/generate.js';
import { GEN_PROMPT_VERSION } from '../pipeline/dist/gen-prompt.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 환경변수 직접 주입 */
}

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const PER = Number(opt('--per', '5'));
const GROUP = Number(opt('--group', '3'));
const PLAN = args.includes('--plan');
const SLOT_FILE = opt('--slots', 'data/pipeline/compare-slots.json');

// ── 1. 슬롯 목록 읽기
const spec = JSON.parse(await readFile(path.join(ROOT, SLOT_FILE), 'utf8'));
const slots = [];
for (const s of spec.slots) {
  const mid = findMid(s.midKey);
  if (!mid) {
    console.error(`[cmp] ★ 없는 중분류 키: ${s.midKey}`);
    process.exit(1);
  }
  if (!mid.subs.includes(s.sub)) {
    console.error(`[cmp] ★ ${s.midKey} 에 없는 소분류: ${s.sub}`);
    console.error(`[cmp]   가능한 값: ${mid.subs.join(' / ')}`);
    process.exit(1);
  }
  const major = findMajor(mid.major);
  for (let i = 0; i < PER; i += 1) {
    slots.push({
      slotId: `${s.midKey}@${s.sub}#${i + 1}`,
      midKey: s.midKey,
      midNameKo: mid.nameKo,
      majorNameKo: major?.nameKo ?? mid.major,
      sub: s.sub,
      boundary: mid.boundary,
      subNote: mid.subNotes?.[s.sub],
    });
  }
}

const byMajor = {};
for (const s of spec.slots) {
  const mid = findMid(s.midKey);
  const m = findMajor(mid.major)?.nameKo ?? mid.major;
  byMajor[m] = (byMajor[m] ?? 0) + 1;
}

console.log(`[cmp] 소분류 ${spec.slots.length}개 × ${PER}건 = 슬롯 ${slots.length}개`);
console.log(`[cmp] 대분류 분포: ${JSON.stringify(byMajor, null, 0)}`);
console.log(`[cmp] 프롬프트: ${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`);
console.log(`[cmp] 호출당 소분류 ${GROUP}개 → 생성 호출 ${Math.ceil(spec.slots.length / GROUP)}회 예정`);

if (PLAN) {
  for (const s of spec.slots) {
    const mid = findMid(s.midKey);
    console.log(`  ${(findMajor(mid.major)?.nameKo ?? '').padEnd(6)} > ${mid.nameKo.padEnd(14)} > ${s.sub}`);
    console.log(`      ${s.why}`);
  }
  process.exit(0);
}

// ── 2. 예산 게이트
const state = await loadState(ROOT);
const gate = checkGate(state);
console.log(
  `[cmp] 오늘(${state.day}) 처리 ${state.items}/${LIMITS.dailyItems}건 / 토큰 ${state.tokens} / 호출 ${state.calls}회`,
);
if (!gate.ok) {
  console.error(`[cmp] ★ 시작하지 않는다 — ${gate.detail}`);
  process.exit(0);
}

// ── 3. 생성
const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const startedAt = new Date();
const { results, stats } = await generateBatch({
  client,
  mids: [],
  perMid: PER,
  midsPerCall: GROUP,
  explicitSlots: slots,
  state,
  log: (m) => console.log(m),
});
state.items += stats.llmSlots;
closeSegment(state, false);
await saveState(ROOT, state);

// ── 4. 저장
const dir = path.join(ROOT, DATA_DIRS.processed);
await mkdir(dir, { recursive: true });
const outFile = path.join(dir, '2026-09-10-compare-gemini.json');
const batch = {
  _meta: {
    sourceId: GEN_SOURCE_ID,
    batch: 'R012-compare-gemini',
    kind: 'compare',
    generator: 'gemini',
    processModel: MODELS.processChain[0],
    backcheckModel: MODELS.assist,
    promptVersion: `${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`,
    slotFile: SLOT_FILE,
    perSlot: PER,
    generatedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
    counts: {
      requestedSlots: stats.requestedSlots,
      llmSlots: stats.llmSlots,
      returned: stats.returned,
      missing: stats.missing,
      offCategory: stats.offCategory,
      emptyGeneration: stats.emptyGeneration,
      backcheckRejected: stats.backcheckRejected,
      rulesRejected: stats.rulesRejected,
      accepted: stats.accepted,
      escalated: stats.escalated,
    },
    rejectReasons: stats.rejectReasons,
    modelUsage: stats.modelUsage,
    tokens: stats.tokens,
    callLog: stats.callLog,
    stoppedByRateLimit: stats.stoppedByRateLimit,
  },
  items: results,
};
await writeFile(outFile, JSON.stringify(batch, null, 2) + '\n', 'utf8');

const c = batch._meta.counts;
console.log('\n──────────────────────────────────────────');
console.log(`[cmp] 슬롯 ${c.requestedSlots} / 반환 ${c.returned} / 누락 ${c.missing} / 카테고리불일치 ${c.offCategory}`);
console.log(`[cmp] 역검증 탈락 ${c.backcheckRejected} / 규칙 탈락 ${c.rulesRejected}`);
console.log(`[cmp] ★ 통과 ${c.accepted}건 (${c.llmSlots ? ((c.accepted / c.llmSlots) * 100).toFixed(1) : 0}%)`);
console.log(`[cmp] 토큰 ${stats.tokens.total} / 호출 ${stats.tokens.calls}회 / 모델 ${JSON.stringify(stats.modelUsage)}`);
console.log(`[cmp] 저장: ${path.relative(ROOT, outFile)}`);
console.log('[cmp] ★ 이 배치의 역검증은 Gemini 가 했다. 작업 A-3 에서 Claude Code 가 다시 검증한다.');
