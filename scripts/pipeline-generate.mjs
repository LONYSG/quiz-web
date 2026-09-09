#!/usr/bin/env node
// =============================================================================
// 문제 생성 (작업 A + B + D / R011)
//
// ★ 컴파일 산출물을 실행한다 (D-020).
//
// ★★ 이 명령이 세 가지를 동시에 한다
//   (1) 카테고리별 샘플 생성            — 건우 판단용 산출물 (최우선)
//   (2) 무료 한도 하루 처리량 실측       — 호출·토큰·429·구간을 상태 파일에 남긴다
//   (3) 429 → 15분 대기 → 1회 재개 검증 — Q-62 (B) 확정 규칙의 실제 동작
//
// ★ 지시대로 (1)을 우선한다. 한도가 부족하면 mustSample 카테고리부터 채운다.
//   생성 순서는 categories.ts 의 generationOrder() 가 정한다.
//
// 사용법
//   npm run pipeline:generate                          기본 (전체 중분류)
//   npm run pipeline:generate -- --per 2 --group 8     중분류당 2건, 호출당 8개 중분류
//   npm run pipeline:generate -- --mids 12             앞의 12개 중분류만
//   npm run pipeline:generate -- --skip 11               앞의 11개는 건너뛴다
//   npm run pipeline:generate -- --only symbols,drinks    특정 중분류만
//   npm run pipeline:generate -- --plan                호출 계획만 보고 끝낸다 (API 미호출)
//   npm run pipeline:generate -- --no-resume           429 재개를 쓰지 않는다
// =============================================================================

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS, LIMITS, MODELS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import {
  canResume,
  checkGate,
  closeSegment,
  currentSegment,
  loadState,
  recordResume,
  saveState,
} from '../pipeline/dist/budget.js';
import { GeminiClient, RateLimitError } from '../pipeline/dist/gemini.js';
import { generationOrder, treeStats, categoryPath } from '../pipeline/dist/categories.js';
import { generateBatch, GEN_SOURCE_ID } from '../pipeline/dist/generate.js';
import { GEN_PROMPT_VERSION, buildSlots } from '../pipeline/dist/gen-prompt.js';
import { findDuplicates } from '../pipeline/dist/dedupe.js';

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
const PER_MID = Number(opt('--per', '2'));
const MIDS_PER_CALL = Number(opt('--group', '8'));
const MID_LIMIT = Number(opt('--mids', '0'));
// ★ 이미 만든 중분류를 건너뛴다. 429 로 끊긴 지점부터 이어갈 때 쓴다
const MID_SKIP = Number(opt('--skip', '0'));
// ★ 소분류 시작 위치. 같은 중분류를 두 번째로 돌 때 쓴다 (중복 방지)
const SUB_OFFSET = Number(opt('--offset', '0'));
// ★ 특정 중분류만 다시 돈다. 앞선 실행에서 덜 채워진 카테고리를 메울 때 쓴다.
const ONLY = (opt('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PLAN_ONLY = args.includes('--plan');
const NO_RESUME = args.includes('--no-resume');

// ── 1. 생성 순서
let mids = generationOrder();
if (ONLY.length > 0) {
  mids = mids.filter((m) => ONLY.includes(m.key));
  const missing = ONLY.filter((k) => !mids.some((m) => m.key === k));
  if (missing.length > 0) {
    console.error(`[gen] ★ 없는 중분류 키: ${missing.join(', ')}`);
    process.exit(1);
  }
}
if (MID_SKIP > 0) mids = mids.slice(MID_SKIP);
if (MID_LIMIT > 0) mids = mids.slice(0, MID_LIMIT);

const tree = treeStats();
console.log(
  `[gen] 카테고리 트리: 대분류 ${tree.majors} / 중분류 ${tree.mids}(활성 ${tree.enabled}) / 소분류 ${tree.subs}`,
);
console.log(
  `[gen] 이번 대상: 중분류 ${mids.length}개 × ${PER_MID}건 = ${mids.length * PER_MID}건 / ` +
    `호출당 중분류 ${MIDS_PER_CALL}개 → 생성 호출 ${Math.ceil(mids.length / MIDS_PER_CALL)}회 예정`,
);

if (PLAN_ONLY) {
  const slots = buildSlots(mids, PER_MID, SUB_OFFSET);
  console.log(`\n[plan] 슬롯 ${slots.length}개`);
  for (const s of slots) console.log(`  ${s.slotId.padEnd(26)} ${categoryPath(s.midKey, s.sub)}`);
  process.exit(0);
}

// ── 2. ★ 예산 게이트 (Q-54)
const state = await loadState(ROOT);
const gate = checkGate(state);
console.log(
  `[gen] 오늘(${state.day}) 상태: 처리 ${state.items}/${LIMITS.dailyItems}건 / ` +
    `토큰 ${state.tokens}/${LIMITS.dailyTokens} / 호출 ${state.calls}회 / ` +
    `429 ${state.rateLimitHits ?? 0}회 / 재개 ${(state.resumes ?? []).length}회`,
);
if (!gate.ok) {
  console.error(`[gen] ★ 시작하지 않는다 — ${gate.detail}`);
  // ★ 게이트에 걸린 것은 실패가 아니다. 정상 동작이다. 종료 코드 0.
  process.exit(0);
}

// ── 3. 생성 (★ 429 → 15분 대기 → 1회 재개)
const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const startedAt = new Date();
const allResults = [];
const allStats = [];
let remaining = mids;

for (let pass = 1; ; pass += 1) {
  const { results, stats } = await generateBatch({
    client,
    mids: remaining,
    perMid: PER_MID,
    midsPerCall: MIDS_PER_CALL,
    subOffset: SUB_OFFSET,
    state,
    log: (m) => console.log(m),
  });
  allResults.push(...results);
  allStats.push(stats);
  state.items += stats.llmSlots;
  await saveState(ROOT, state);

  // ★ 처리한 중분류를 대상에서 뺀다. 재개했을 때 같은 것을 또 만들지 않는다.
  const touched = new Set(results.map((r) => r.gen?.midKey).filter(Boolean));
  remaining = remaining.filter((m) => !touched.has(m.key));

  if (!stats.stoppedByRateLimit) {
    closeSegment(state, false);
    await saveState(ROOT, state);
    break;
  }
  if (remaining.length === 0) break;

  // ── ★ 429 를 맞았다. Q-62 (B): 15분 대기 후 1회 재개한다
  if (NO_RESUME) {
    console.log('[gen] ★ 429. --no-resume 이므로 재개하지 않는다.');
    break;
  }
  if (!canResume(state)) {
    console.log(
      `[gen] ★ 429. 오늘 재개 한도(${LIMITS.maxResumesPerDay}회)를 이미 썼다. 그날 중단한다 (Q-62).`,
    );
    break;
  }

  const waitMin = Math.round(LIMITS.rateLimitWaitMs / 60000);
  console.log(`[gen] ★ 429 — ${waitMin}분 대기 후 1회 재개한다 (Q-62 (B) 확정 규칙).`);
  console.log(`[gen]   남은 중분류 ${remaining.length}개. 재개 시각 예정: ${new Date(Date.now() + LIMITS.rateLimitWaitMs).toISOString()}`);
  await new Promise((r) => setTimeout(r, LIMITS.rateLimitWaitMs));

  recordResume(state);
  currentSegment(state); // ★ 새 구간을 열어 재개 후 소비량을 따로 센다
  await saveState(ROOT, state);
  console.log(`[gen] ★ 재개한다 (${(state.resumes ?? []).length}번째).`);
}

// ── 4. 합계
const total = {
  requestedSlots: 0, llmSlots: 0, returned: 0, missing: 0, offCategory: 0,
  emptyGeneration: 0, backcheckRejected: 0, rulesRejected: 0, accepted: 0, escalated: 0,
  modelUsage: {}, rejectReasons: {},
  tokens: { total: 0, prompt: 0, output: 0, thoughts: 0, calls: 0 },
  callLog: [], stoppedByRateLimit: false,
};
for (const s of allStats) {
  for (const k of ['requestedSlots', 'llmSlots', 'returned', 'missing', 'offCategory',
    'emptyGeneration', 'backcheckRejected', 'rulesRejected', 'accepted', 'escalated']) {
    total[k] += s[k];
  }
  for (const [k, v] of Object.entries(s.modelUsage)) total.modelUsage[k] = (total.modelUsage[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.rejectReasons)) total.rejectReasons[k] = (total.rejectReasons[k] ?? 0) + v;
  for (const k of ['total', 'prompt', 'output', 'thoughts', 'calls']) total.tokens[k] += s.tokens[k];
  total.callLog.push(...s.callLog);
  total.stoppedByRateLimit = total.stoppedByRateLimit || s.stoppedByRateLimit;
}

// ── 5. ★ 중복 판정 (D-4). 버리지 않고 보관한다
const acceptedItems = allResults.filter((r) => r.verdict === 'accept' && r.generated);
const dupe = findDuplicates(
  acceptedItems.map((r) => ({
    ref: r.sourceRef,
    midKey: r.gen?.midKey ?? '',
    majorKey: r.gen?.majorKey ?? '',
    question: r.generated.questionKo,
    answers: r.generated.answers,
  })),
);

// ── 6. 저장
const processedDir = path.join(ROOT, DATA_DIRS.processed);
await mkdir(processedDir, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
let seq = 1;
try {
  const existing = await readdir(processedDir);
  seq = existing.filter((f) => f.startsWith(`${day}-gen`)).length + 1;
} catch {
  /* 새 디렉터리 */
}
const batchName = `${day}-gen${String(seq).padStart(2, '0')}`;

const batch = {
  _meta: {
    sourceId: GEN_SOURCE_ID,
    batch: batchName,
    kind: 'generate',
    processModel: MODELS.processChain[0],
    backcheckModel: MODELS.assist,
    promptVersion: `${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`,
    generatedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
    perMid: PER_MID,
    midsPerCall: MIDS_PER_CALL,
    counts: {
      requestedSlots: total.requestedSlots,
      llmSlots: total.llmSlots,
      returned: total.returned,
      missing: total.missing,
      offCategory: total.offCategory,
      emptyGeneration: total.emptyGeneration,
      backcheckRejected: total.backcheckRejected,
      rulesRejected: total.rulesRejected,
      accepted: total.accepted,
      escalated: total.escalated,
    },
    rejectReasons: total.rejectReasons,
    modelUsage: total.modelUsage,
    tokens: total.tokens,
    callLog: total.callLog,
    stoppedByRateLimit: total.stoppedByRateLimit,
    dupe: { counts: dupe.counts, candidatePairs: dupe.candidatePairs, totalPairsIfBruteForce: dupe.totalPairsIfBruteForce, pairs: dupe.pairs },
  },
  items: allResults,
};
const outFile = path.join(processedDir, `${batchName}.json`);
await writeFile(outFile, JSON.stringify(batch, null, 2) + '\n', 'utf8');

// ── 7. 요약
const c = batch._meta.counts;
console.log('\n──────────────────────────────────────────');
console.log(`[gen] 슬롯 요청 ${c.requestedSlots} / LLM 도달 ${c.llmSlots} / 모델 반환 ${c.returned}`);
console.log(`[gen]   슬롯 누락 ${c.missing} / 카테고리 불일치 ${c.offCategory} / 빈 생성 ${c.emptyGeneration}`);
console.log(`[gen]   역검증 탈락 ${c.backcheckRejected} / 규칙 탈락 ${c.rulesRejected}`);
console.log(`[gen] ★ 최종 통과 ${c.accepted}건 (생존율 ${c.llmSlots ? ((c.accepted / c.llmSlots) * 100).toFixed(1) : 0}%)`);
console.log(`[gen] 단계별 게이트: 상위 모델 승급 ${c.escalated}건`);
console.log(`[gen] 토큰 ${total.tokens.total} (사고 ${total.tokens.thoughts}) / 호출 ${total.tokens.calls}회`);
console.log(`[gen] 모델 사용: ${JSON.stringify(total.modelUsage)}`);
console.log(`[gen] 중복 판정: ${JSON.stringify(dupe.counts)} (후보 쌍 ${dupe.candidatePairs} / 전수라면 ${dupe.totalPairsIfBruteForce})`);
console.log(`[gen] 429 ${state.rateLimitHits ?? 0}회 / 재개 ${(state.resumes ?? []).length}회`);
console.log(`[gen] 저장: ${path.relative(ROOT, outFile)}`);
console.log('[gen] ★ 자동 적재하지 않는다. 건우 판단 후 검수·적재한다 (작업 E).');
