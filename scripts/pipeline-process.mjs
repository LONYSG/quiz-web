#!/usr/bin/env node
// =============================================================================
// 배치 가공 (작업 D + E + H)
//
// ★ 컴파일 산출물을 실행한다 (D-020).
//
// ★★ 시작 전에 예산 게이트를 통과해야 한다 (Q-54)
//   · 오늘 이미 429 를 받았으면 시작하지 않는다
//   · 오늘 처리 건수·토큰 상한에 도달했으면 시작하지 않는다
//   ★ 한도를 모르는 상태에서 배치를 돌리면 한도를 넘긴 뒤에야 알게 된다.
//     그래서 게이트가 가공 코드보다 먼저다.
//
// ★ 이미 가공한 것은 다시 가공하지 않는다.
//   processed/ 의 모든 sourceRef 를 모아 제외한다. 토큰은 유한한 자원이다.
//
// 사용법
//   npm run pipeline:process -- --limit 100
//   npm run pipeline:process -- --limit 100 --dry-run    LLM 없이 규칙 필터만
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIRS, LIMITS, MODELS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import { checkGate, loadState, remainingItems, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient } from '../pipeline/dist/gemini.js';
import { processBatch } from '../pipeline/dist/process.js';
import { ruleFilter } from '../pipeline/dist/filter.js';

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
const LIMIT = Number(opt('--limit', '50'));
const SOURCE = opt('--source', 'opentdb');
const DRY = args.includes('--dry-run');

// ── 1. 원본 읽기
const rawDir = path.join(ROOT, DATA_DIRS.raw, SOURCE);
let rawFiles = [];
try {
  rawFiles = (await readdir(rawDir)).filter((f) => f.endsWith('.jsonl')).sort();
} catch {
  console.error(`[process] 원본이 없다: ${path.relative(ROOT, rawDir)}`);
  console.error('[process]   먼저 npm run pipeline:harvest 를 실행한다.');
  process.exit(1);
}

const all = [];
for (const f of rawFiles) {
  const text = await readFile(path.join(rawDir, f), 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      all.push(JSON.parse(line));
    } catch {
      /* 깨진 줄 */
    }
  }
}
console.log(`[process] 원본 ${all.length}건 (${rawFiles.length}개 파일)`);

// ── 2. 이미 가공한 것 제외
const processedDir = path.join(ROOT, DATA_DIRS.processed, SOURCE);
const done = new Set();
try {
  for (const f of await readdir(processedDir)) {
    if (!f.endsWith('.json')) continue;
    const batch = JSON.parse(await readFile(path.join(processedDir, f), 'utf8'));
    for (const item of batch.items ?? []) done.add(item.sourceRef);
  }
} catch {
  /* 아직 없다 */
}
const pending = all.filter((q) => !done.has(q.sourceRef));
console.log(`[process] 이미 가공: ${done.size}건 / 남은 것: ${pending.length}건`);

if (pending.length === 0) {
  console.log('[process] 가공할 것이 없다.');
  process.exit(0);
}

// ── 3. dry-run: 규칙 필터만 (LLM 을 부르지 않는다)
if (DRY) {
  const target = pending.slice(0, LIMIT);
  const reasons = {};
  let pass = 0;
  const blocked = [];
  for (const item of target) {
    const f = ruleFilter(item);
    if (f.pass) {
      pass += 1;
      continue;
    }
    for (const r of f.reasons) reasons[r] = (reasons[r] ?? 0) + 1;
    blocked.push({ sourceRef: item.sourceRef, question: item.question, correct: item.correct, reasons: f.reasons });
  }
  console.log(`\n[dry-run] 규칙 필터: ${target.length} → ${pass} (탈락 ${target.length - pass})`);
  console.log(`[dry-run] 차단율 ${(((target.length - pass) / target.length) * 100).toFixed(1)}%`);
  console.log('[dry-run] 탈락 사유 분포:');
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  const outFile = path.join(ROOT, 'tmp', 'filter-blocked.json');
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(blocked, null, 2), 'utf8');
  console.log(`\n[dry-run] 차단된 문제 전체: ${path.relative(ROOT, outFile)}`);
  console.log('[dry-run] ★ 표본을 뽑아 실제로 부적합한지 확인해야 한다 (오차단 검토)');
  process.exit(0);
}

// ── 4. ★ 예산 게이트
const state = await loadState(ROOT);
const gate = checkGate(state);
console.log(
  `[process] 오늘(${state.day}) 상태: 처리 ${state.items}/${LIMITS.dailyItems}건 / ` +
    `토큰 ${state.tokens}/${LIMITS.dailyTokens} / 호출 ${state.calls}회`,
);
if (!gate.ok) {
  console.error(`[process] ★ 시작하지 않는다 — ${gate.detail}`);
  // ★ 게이트에 걸린 것은 실패가 아니다. 정상 동작이다. 종료 코드 0.
  process.exit(0);
}

const budgetLimit = Math.min(LIMIT, remainingItems(state));
if (budgetLimit < LIMIT) {
  console.log(`[process] 예산 상한으로 ${LIMIT} → ${budgetLimit}건으로 줄인다`);
}

// ── 5. 가공
const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const started = Date.now();
const { results, stats } = await processBatch(pending, {
  client,
  limit: budgetLimit,
  log: (m) => console.log(m),
});

// ★ 처리 건수를 상태에 누적한다.
//   ★ stats.input 이 아니라 stats.llmProcessed 를 쓴다.
//     429 로 중간에 멈추면 손도 대지 않은 건수까지 소비로 기록되어
//     남은 예산을 실제보다 적게 본다. R010에서 실제로 그렇게 됐다(100건 중 20건만 처리).
state.items += stats.llmProcessed;
await saveState(ROOT, state);

// ── 6. 결과 저장
const day = new Date().toISOString().slice(0, 10);
let seq = 1;
try {
  const existing = await readdir(processedDir);
  seq = existing.filter((f) => f.startsWith(day)).length + 1;
} catch {
  /* 새 디렉터리 */
}
const batchName = `${day}-batch${String(seq).padStart(2, '0')}`;

const batch = {
  _meta: {
    sourceId: SOURCE,
    batch: batchName,
    processModel: MODELS.processChain[0],
    backcheckModel: MODELS.backcheckChain[0],
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    counts: {
      input: stats.input,
      filtered: stats.filtered,
      aiRejected: stats.aiRejected,
      backcheckRejected: stats.backcheckRejected,
      rulesRejected: stats.rulesRejected,
      accepted: stats.accepted,
    },
    tokens: stats.tokens,
    modelUsage: stats.modelUsage,
    filterReasons: stats.filterReasons,
    aiReasons: stats.aiReasons,
    stoppedByRateLimit: stats.stoppedByRateLimit,
  },
  items: results,
};

await mkdir(processedDir, { recursive: true });
const outFile = path.join(processedDir, `${batchName}.json`);
await writeFile(outFile, JSON.stringify(batch, null, 2) + '\n', 'utf8');

// ── 7. 보고
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const survival = stats.input > 0 ? ((stats.accepted / stats.input) * 100).toFixed(1) : '0';
console.log('');
console.log(`[process] 저장: ${path.relative(ROOT, outFile)}  (${elapsed}초)`);
console.log('[process] 단계별 결과');
console.log(`  입력            ${stats.input}`);
console.log(`  규칙 필터 탈락   ${stats.filtered}`);
console.log(`  1차 가공 탈락    ${stats.aiRejected}`);
console.log(`  역검증 탈락      ${stats.backcheckRejected}`);
console.log(`  규칙 검사 탈락   ${stats.rulesRejected}`);
console.log(`  ★ 최종 통과     ${stats.accepted}  (생존율 ${survival}%)`);
console.log(
  `[process] 토큰: 총 ${stats.tokens.total} ` +
    `(프롬프트 ${stats.tokens.prompt} / 출력 ${stats.tokens.output} / 사고 ${stats.tokens.thoughts}) ` +
    `호출 ${stats.tokens.calls}회`,
);
console.log(`[process] 실제 사용 모델: ${JSON.stringify(stats.modelUsage)}`);
console.log(`[process] LLM 에 보낸 건수: ${stats.llmProcessed} (예산에 반영되는 값)`);
if (stats.stoppedByRateLimit) {
  console.log('[process] ★ 429 로 중단되었다. 오늘은 더 실행하지 않는다.');
}
