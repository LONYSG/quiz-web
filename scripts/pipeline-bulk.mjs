#!/usr/bin/env node
// =============================================================================
// 로컬 대량 생성 (R012 작업 E-3 / 다음 라운드 준비)
//
// ★★ Actions 정기 실행을 폐기하고(Q-71) 이것으로 대체한다.
//   건우 판단: "시간의 흐름이 중요한 작업이 아니다. PC는 평일 일과시간이면 계속 켜져 있다."
//
// ★★ 중단하고 재개할 수 있어야 한다 (지시)
//   회사에서 틈날 때 돌리므로 중간에 끊긴다. 그리고 Claude Code 쪽은
//   토큰 한도에 걸려 몇 시간 뒤에 이어가야 한다.
//   → 진행 상태를 파일에 남기고, 다시 실행하면 **이미 채운 소분류를 건너뛴다.**
//
// ★★ Claude Code 생성분도 같은 상태 파일을 쓴다 (지시)
//   양쪽 진행을 한 곳에서 봐야 한다. processed/ 의 모든 배치를 훑어
//   소분류별 누적 건수를 센다. ★ 별도 카운터를 두지 않는다 —
//   별도로 두면 두 숫자가 어긋나는 순간 어느 쪽이 맞는지 알 수 없다.
//
// 사용법
//   node scripts/pipeline-bulk.mjs --status              ★ 진행 상황만 본다
//   node scripts/pipeline-bulk.mjs --target 500          목표 건수까지 생성한다
//   node scripts/pipeline-bulk.mjs --target 500 --plan   무엇을 요청할지만 본다
//   node scripts/pipeline-bulk.mjs --per-sub 2           소분류당 목표 건수로 지정한다
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
import { GeminiClient } from '../pipeline/dist/gemini.js';
import { MAJORS, MIDS, enabledMids, findMajor, findMid } from '../pipeline/dist/categories.js';
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
const STATUS_ONLY = args.includes('--status');
const PLAN = args.includes('--plan');
const TARGET = Number(opt('--target', '0'));
const PER_SUB = Number(opt('--per-sub', '0'));
const SLOTS_PER_CALL = Number(opt('--group', '25'));
const NO_RESUME = args.includes('--no-resume');

// ─────────────────────────────────────────────────────────────────────────────
// 1. ★ 진행 상황 — processed/ 를 훑어 소분류별 누적 건수를 센다
//   ★ 이것이 유일한 진행 기록이다. Gemini 생성분과 Claude Code 생성분이
//     같은 디렉터리에 있으므로 자연히 합쳐진다.
// ─────────────────────────────────────────────────────────────────────────────
const dir = path.join(ROOT, DATA_DIRS.processed);
await mkdir(dir, { recursive: true });
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

/** "midKey|sub" → { accepted, rejected, byGenerator } */
const counts = new Map();
const generators = new Map();
let totalAccepted = 0;

for (const f of files) {
  const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  const gen = d._meta?.generator ?? d._meta?.processModel ?? 'unknown';
  for (const i of d.items ?? []) {
    if (!i.gen?.midKey || !i.gen?.sub) continue;
    const key = `${i.gen.midKey}|${i.gen.sub}`;
    const c = counts.get(key) ?? { accepted: 0, rejected: 0 };
    if (i.verdict === 'accept') {
      c.accepted += 1;
      totalAccepted += 1;
      const g = i.meta?.processModel === 'claude-code' ? 'claude-code' : 'gemini';
      generators.set(g, (generators.get(g) ?? 0) + 1);
    } else {
      c.rejected += 1;
    }
    counts.set(key, c);
  }
}

const allSubs = [];
for (const mid of enabledMids()) {
  for (const sub of mid.subs) allSubs.push({ midKey: mid.key, sub, mid });
}

const filled = allSubs.filter((s) => (counts.get(`${s.midKey}|${s.sub}`)?.accepted ?? 0) > 0).length;

console.log('══════════════════════════════════════════');
console.log('■ 진행 상황');
console.log('══════════════════════════════════════════');
console.log(`통과 문제 ${totalAccepted}건 / 소분류 ${allSubs.length}개 중 ${filled}개에 문제가 있다`);
console.log(`생성자별: ${JSON.stringify(Object.fromEntries(generators))}`);
console.log('');
console.log('대분류별 (통과 / 소분류 커버)');
for (const mj of MAJORS) {
  const mids = MIDS.filter((m) => m.major === mj.key && m.enabled);
  let acc = 0;
  let subs = 0;
  let cov = 0;
  for (const m of mids) {
    for (const s of m.subs) {
      subs += 1;
      const c = counts.get(`${m.key}|${s}`)?.accepted ?? 0;
      acc += c;
      if (c > 0) cov += 1;
    }
  }
  const bar = '█'.repeat(Math.round((cov / Math.max(1, subs)) * 20)).padEnd(20, '·');
  console.log(`  ${mj.nameKo.padEnd(6)} ${bar} ${String(acc).padStart(4)}건 / 소분류 ${cov}/${subs}`);
}

if (STATUS_ONLY) {
  console.log('');
  console.log('★ 아직 문제가 없는 소분류:');
  const empty = allSubs.filter((s) => (counts.get(`${s.midKey}|${s.sub}`)?.accepted ?? 0) === 0);
  for (const s of empty.slice(0, 40)) {
    console.log(`   ${s.mid.nameKo} > ${s.sub}`);
  }
  if (empty.length > 40) console.log(`   … 그 밖에 ${empty.length - 40}개`);
  console.log('');
  console.log(`★ 소분류당 1건씩만 채워도 ${allSubs.length}건이다.`);
  console.log(`★ 소분류당 3건이면 ${allSubs.length * 3}건이다 (건우 목표 수천 건의 근거).`);
  process.exit(0);
}

if (TARGET <= 0 && PER_SUB <= 0) {
  console.error('\n[bulk] --target 또는 --per-sub 를 지정한다. (--status 로 현황만 볼 수 있다)');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ★ 무엇을 생성할지 정한다 — 적게 채워진 소분류부터
//   ★ 트리를 넓게 채우는 것이 목표다. 한 소분류를 깊게 파면 중복이 난다 (R011 실측)
// ─────────────────────────────────────────────────────────────────────────────
const perSubTarget =
  PER_SUB > 0 ? PER_SUB : Math.max(1, Math.ceil((totalAccepted + TARGET) / allSubs.length));

const need = [];
for (const s of allSubs) {
  const have = counts.get(`${s.midKey}|${s.sub}`)?.accepted ?? 0;
  const want = perSubTarget - have;
  if (want > 0) need.push({ ...s, have, want });
}
// ★ 적게 채워진 것부터. 같으면 대분류를 번갈아 돈다
need.sort((a, b) => a.have - b.have);

const slots = [];
let remaining = TARGET > 0 ? TARGET : need.reduce((n, x) => n + x.want, 0);
// ★ 라운드로빈: 소분류를 한 바퀴 돌며 1건씩 채운다.
//   ★ 한 소분류를 연속으로 채우면 같은 소재가 반복된다
for (let pass = 0; remaining > 0; pass += 1) {
  let placed = 0;
  for (const s of need) {
    if (remaining <= 0) break;
    if (pass >= s.want) continue;
    const major = findMajor(s.mid.major);
    slots.push({
      slotId: `${s.midKey}@${s.sub}#${s.have + pass + 1}`,
      midKey: s.midKey,
      midNameKo: s.mid.nameKo,
      majorNameKo: major?.nameKo ?? s.mid.major,
      sub: s.sub,
      boundary: s.mid.boundary,
      subNote: s.mid.subNotes?.[s.sub],
    });
    remaining -= 1;
    placed += 1;
  }
  if (placed === 0) break;
}

console.log('');
console.log('══════════════════════════════════════════');
console.log('■ 이번 실행 계획');
console.log('══════════════════════════════════════════');
console.log(`소분류당 목표 ${perSubTarget}건 / 채울 슬롯 ${slots.length}개`);
console.log(`호출당 슬롯 ${SLOTS_PER_CALL}개 → 생성 호출 ${Math.ceil(slots.length / SLOTS_PER_CALL)}회 예정`);
console.log(`자체 건수 상한: ${LIMITS.dailyItems} (PIPELINE_DAILY_ITEMS 로 조정)`);

if (PLAN) {
  const byMid = new Map();
  for (const s of slots) byMid.set(s.midKey, (byMid.get(s.midKey) ?? 0) + 1);
  console.log('');
  for (const [k, v] of [...byMid].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${findMid(k)?.nameKo.padEnd(16)} ${v}건`);
  }
  process.exit(0);
}
if (slots.length === 0) {
  console.log('\n[bulk] 채울 슬롯이 없다. --per-sub 를 올리거나 트리를 넓힌다.');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 예산 게이트
// ─────────────────────────────────────────────────────────────────────────────
const state = await loadState(ROOT);
const gate = checkGate(state);
console.log('');
console.log(
  `[bulk] 오늘(${state.day}) 처리 ${state.items}/${LIMITS.dailyItems}건 / 토큰 ${state.tokens} / ` +
    `호출 ${state.calls}회 / 429 ${state.rateLimitHits ?? 0}회 / 재개 ${(state.resumes ?? []).length}회`,
);
if (!gate.ok) {
  console.error(`[bulk] ★ 시작하지 않는다 — ${gate.detail}`);
  // ★ 게이트에 걸린 것은 실패가 아니다. 종료 코드 0
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 생성 (★ 429 → 15분 대기 → 1회 재개)
// ─────────────────────────────────────────────────────────────────────────────
const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const startedAt = new Date();
const allResults = [];
const allStats = [];
let pending = slots;

for (;;) {
  const { results, stats } = await generateBatch({
    client,
    mids: [],
    perMid: 1,
    midsPerCall: SLOTS_PER_CALL,
    explicitSlots: pending,
    state,
    log: (m) => console.log(m),
  });
  allResults.push(...results);
  allStats.push(stats);
  state.items += stats.llmSlots;
  await saveState(ROOT, state);

  // ★ 처리된 슬롯을 대상에서 뺀다. 재개했을 때 같은 것을 또 만들지 않는다.
  //   ★ generateBatch 는 슬롯 순서대로 처리하고 결과를 그 순서로 돌려준다.
  //     429 로 중간에 멈추면 결과가 그만큼만 온다. 그래서 개수로 잘라내는 것이 정확하다.
  //   ★ 키로 비교하면 같은 소분류의 여러 슬롯을 구분할 수 없다 (같은 midKey|sub 다).
  pending = pending.slice(results.length);

  if (!stats.stoppedByRateLimit) {
    closeSegment(state, false);
    await saveState(ROOT, state);
    break;
  }
  if (pending.length === 0) break;
  if (NO_RESUME) {
    console.log('[bulk] ★ 429. --no-resume 이므로 재개하지 않는다.');
    break;
  }
  if (!canResume(state)) {
    console.log(`[bulk] ★ 429. 재개 한도(${LIMITS.maxResumesPerDay}회)를 이미 썼다. 그날 중단한다 (Q-62).`);
    break;
  }
  const waitMin = Math.round(LIMITS.rateLimitWaitMs / 60000);
  console.log(`[bulk] ★ 429 — ${waitMin}분 대기 후 1회 재개한다 (Q-62). 남은 슬롯 ${pending.length}개`);
  console.log(`[bulk]   ★ 지금까지 만든 것은 이미 확보되어 있다. 잃지 않는다`);
  await new Promise((r) => setTimeout(r, LIMITS.rateLimitWaitMs));
  recordResume(state);
  currentSegment(state);
  await saveState(ROOT, state);
  console.log(`[bulk] ★ 재개한다 (${(state.resumes ?? []).length}번째).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 저장
// ─────────────────────────────────────────────────────────────────────────────
const total = { requestedSlots: 0, llmSlots: 0, returned: 0, missing: 0, offCategory: 0, emptyGeneration: 0, backcheckRejected: 0, rulesRejected: 0, accepted: 0, escalated: 0 };
const tokens = { total: 0, prompt: 0, output: 0, thoughts: 0, calls: 0 };
const modelUsage = {};
const rejectReasons = {};
const callLog = [];
let stopped = false;
for (const s of allStats) {
  for (const k of Object.keys(total)) total[k] += s[k];
  for (const k of Object.keys(tokens)) tokens[k] += s.tokens[k];
  for (const [k, v] of Object.entries(s.modelUsage)) modelUsage[k] = (modelUsage[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.rejectReasons)) rejectReasons[k] = (rejectReasons[k] ?? 0) + v;
  callLog.push(...s.callLog);
  stopped = stopped || s.stoppedByRateLimit;
}

const day = new Date().toISOString().slice(0, 10);
let seq = 1;
try {
  seq = (await readdir(dir)).filter((f) => f.startsWith(`${day}-bulk`)).length + 1;
} catch {
  /* 새 디렉터리 */
}
const batchName = `${day}-bulk${String(seq).padStart(2, '0')}`;
const outFile = path.join(dir, `${batchName}.json`);
await writeFile(
  outFile,
  JSON.stringify(
    {
      _meta: {
        sourceId: GEN_SOURCE_ID,
        batch: batchName,
        kind: 'bulk',
        generator: 'gemini',
        processModel: MODELS.processChain[0],
        backcheckModel: MODELS.assist,
        promptVersion: `${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`,
        perSubTarget,
        generatedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        elapsedSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
        counts: total,
        rejectReasons,
        modelUsage,
        tokens,
        callLog,
        stoppedByRateLimit: stopped,
      },
      items: allResults,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('\n──────────────────────────────────────────');
console.log(`[bulk] 슬롯 ${total.requestedSlots} / LLM 도달 ${total.llmSlots} / ★ 통과 ${total.accepted}건`);
console.log(`[bulk] 탈락: 카테고리 ${total.offCategory} / 역검증 ${total.backcheckRejected} / 규칙 ${total.rulesRejected}`);
console.log(`[bulk] 토큰 ${tokens.total} / 호출 ${tokens.calls}회 / 모델 ${JSON.stringify(modelUsage)}`);
console.log(`[bulk] 429 ${state.rateLimitHits ?? 0}회 / 재개 ${(state.resumes ?? []).length}회`);
console.log(`[bulk] 저장: ${path.relative(ROOT, outFile)}`);
if (stopped) {
  console.log('[bulk] ★★ 429 로 중단했다. 다시 실행하면 이어서 채운다 (--status 로 현황 확인).');
}
console.log('[bulk] ★ 자동 적재하지 않는다. 검수 후 npm run pipeline:load 로 적재한다.');
