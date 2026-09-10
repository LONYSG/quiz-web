#!/usr/bin/env node
// =============================================================================
// Gemini 표본 감사 (R014 작업 A-3 / Q-81 확정)
//
// ★★ Gemini 의 새 역할이다. 전량 검증이 아니라 **표본 감사**다.
//
//   Opus     문제 생성 / 규격 설계          (개별 판정 불참)
//   Sonnet   ★ 역검증 + 사실 검토 + 최종 확정. 전량 담당
//   Gemini   ★ 표본 감사. 하루에 쓸 수 있는 만큼만
//
// ★ 왜 역할을 옮겼는가 (Q-81 근거)
//   R013 에서 Gemini 호출이 **하루에 1회만** 성공했다. 필수 경로에 두면
//   생성은 무제한인데 검증이 하루 1~2회로 막혀 파이프라인 전체가 멈춘다.
//
// ★★★ 불일치가 나오면 무엇을 하는가 — 판단과 근거
//
//   ★ **개별 문제의 판정을 뒤집지 않는다.** 이 스크립트는 어떤 항목도 수정하지 않는다.
//     (실제로 배치 파일을 쓰지 않는다. 읽기 전용이다)
//
//   ★ 근거 — Gemini 가 Sonnet 과 다르다는 것이 "Sonnet 이 틀렸다" 를 뜻하지 않는다.
//     실측이 반대 방향을 가리킨다:
//       R010  Gemini 역검증 판정이 정상 문제 **6건을 6건 모두** 오탈락시켰다
//       R012  Gemini 탈락 3건 중 **2건이 오탈락**이었다 (쐐기문자 / 카롤루스 대제)
//     ★ 성능이 더 낮은 쪽의 판정으로 더 높은 쪽의 판정을 덮으면 품질이 내려간다.
//
//   ★ 그럼 무엇에 쓰는가 — **Sonnet 판정 품질의 신호**로만 쓴다.
//     · 일치율이 정상 범위면: Sonnet 이 한쪽으로 치우치지 않았다는 근거가 된다
//     · 일치율이 기준 아래로 떨어지면: ★ 멈추고 사람이 표본을 읽는다.
//       ★ 그때도 판단은 사람이 한다. 코드가 자동으로 뒤집지 않는다
//
//   ★ 그리고 **불일치 항목을 목록으로 남긴다.** 숫자만으로는 원인을 알 수 없다
//     (R011 에서 "탈락 10건 중 5건이 한 원인" 을 안 것은 실제 문제를 읽었기 때문이다).
//
// 사용법
//   node scripts/pipeline-audit.mjs --plan              무엇을 감사할지만 보고 끝낸다
//   node scripts/pipeline-audit.mjs --sample 20         표본 크기 (기본 20)
//   node scripts/pipeline-audit.mjs --batch=R013-sample
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS, MODELS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient, RateLimitError, BudgetError } from '../pipeline/dist/gemini.js';
import { BACKCHECK_SCHEMA, buildBackcheckPrompt } from '../pipeline/dist/prompts.js';
import { judgeBackcheck } from '../pipeline/dist/process.js';

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
const optOf = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const PLAN = args.includes('--plan');
const SAMPLE = Number(opt('--sample', '20'));
const BATCH = optOf('batch', null);
const CHUNK = 15;

/**
 * ★★ 불일치율 경고 기준.
 *
 * ★ 근거
 *   · R012 실측 — 정상 상태에서 Gemini 역검증 탈락률은 1~2% 였다
 *   · R010 오탈락 사태 — 그때는 35% 였다
 *   ★ 그 사이에 문턱을 둔다. 20% 를 넘으면 사람이 표본을 읽어야 한다
 *   ★ 낮게 잡으면(예: 5%) Gemini 자체의 오판만으로도 매번 멈춘다.
 *     ★ Gemini 오판이 잦다는 것이 Q-81 의 전제이므로, 문턱을 낮게 두면 경고가 무의미해진다
 * ★ 표본 10건 미만이면 판정하지 않는다. 비율은 표본이 있어야 뜻을 가진다
 */
const AUDIT_ALERT = { disagreeRate: 0.2, minSample: 10 };

// ── 1. 감사 대상 수집
//   ★ Sonnet 이 역검증한 것만 감사한다. 검증되지 않은 것을 감사해도 비교 대상이 없다
const dir = path.join(ROOT, DATA_DIRS.processed);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
const pool = [];
for (const f of files) {
  const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  const batchName = d._meta?.batch ?? f;
  if (BATCH && batchName !== BATCH) continue;
  for (const it of d.items ?? []) {
    if (!it.generated?.questionKo) continue;
    if (it.meta?.backcheckBy !== 'sonnet') continue;
    pool.push({
      ref: it.sourceRef,
      batch: batchName,
      question: it.generated.questionKo,
      answers: it.generated.answers ?? [],
      displayAnswer: it.generated.displayAnswer,
      // ★ Sonnet 이 어떻게 판정했는가. 비교 기준이다
      sonnetResult: it.backcheck?.result ?? null,
      sonnetAnswer: it.backcheck?.answer ?? null,
      verdict: it.verdict,
      finalVerdict: it.finalDecision?.verdict ?? null,
    });
  }
}

console.log(`[au] 감사 가능 대상 ${pool.length}건 (Sonnet 역검증을 거친 것만)`);
if (pool.length === 0) {
  console.log('[au] ★ 감사할 것이 없다. 먼저 Sonnet 역검증을 진행한다:');
  console.log('[au]   node scripts/pipeline-sonnet.mjs export');
  process.exit(0);
}

// ── 2. 표본 추출
//   ★ 결정적으로 뽑는다. ref 해시 순으로 정렬한 뒤 앞에서 SAMPLE 개.
//   ★ 근거: 매번 다른 표본을 뽑으면 회차 간 일치율 차이가 표본 때문인지
//     판정 품질 때문인지 구분할 수 없다. ★ 같은 대상 집합이면 같은 표본이 나온다.
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const sample = [...pool].sort((a, b) => hash(a.ref) - hash(b.ref)).slice(0, SAMPLE);
const calls = Math.ceil(sample.length / CHUNK);
console.log(`[au] 표본 ${sample.length}건 / 예상 호출 ${calls}회`);
const byBatch = {};
for (const s of sample) byBatch[s.batch] = (byBatch[s.batch] ?? 0) + 1;
console.log(`[au] 배치별: ${JSON.stringify(byBatch)}`);

if (PLAN) {
  console.log('[au] --plan 이므로 호출하지 않고 끝낸다.');
  process.exit(0);
}

// ── 3. Gemini 역검증
const state = await loadState(ROOT);
const gate = checkGate(state);
console.log(`[au] 오늘(${state.day}) 토큰 ${state.tokens} / 호출 ${state.calls}회`);
if (!gate.ok) {
  console.error(`[au] ★ 감사를 시작하지 않는다 — ${gate.detail}`);
  console.error('[au] ★★ 표본 감사는 필수 경로가 아니다 (Q-81). 못 해도 파이프라인은 진행된다.');
  process.exit(0);
}
await saveState(ROOT, state);

const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const chain = [...MODELS.backcheckChain];
const results = new Map();
const tokens = { total: 0, calls: 0 };
let stoppedBy = null;

for (let i = 0; i < sample.length; i += CHUNK) {
  const chunk = sample.slice(i, i + CHUNK);
  try {
    const r = await client.generateWithChain(
      chain,
      buildBackcheckPrompt(chunk.map((s) => ({ sourceRef: s.ref, questionKo: s.question }))),
      BACKCHECK_SCHEMA,
      { maxOutputTokens: 8192 },
    );
    tokens.total += r.usage.total;
    tokens.calls += 1;
    console.log(`[au] ${i + 1}~${i + chunk.length}/${sample.length} [${r.model}] (토큰 ${r.usage.total})`);
    for (const raw of r.value.items ?? []) results.set(raw.sourceRef, { raw, model: r.model });
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof BudgetError) {
      stoppedBy = err.message;
      console.log(`[au] ★ 감사 중단: ${err.message}`);
      break;
    }
    throw err;
  }
}
closeSegment(state, false);
await saveState(ROOT, state);

// ── 4. 비교
//   ★★ 어떤 항목도 수정하지 않는다. 읽기 전용이다
const audited = [];
for (const s of sample) {
  const got = results.get(s.ref);
  if (!got) continue;
  const judged = judgeBackcheck(got.raw, s.answers);
  audited.push({
    ...s,
    geminiModel: got.model,
    geminiAnswer: judged.result.answer,
    geminiResult: judged.result.result,
    geminiWouldQuarantine: judged.reject,
    geminiQuestionIssue: judged.hasQuestionIssue,
    geminiNote: judged.result.note,
    // ★ 불일치의 정의: 한쪽은 격리할 것이고 다른 쪽은 통과시킬 것이다
    sonnetWouldQuarantine: s.sonnetResult !== null && s.sonnetResult !== 'pass',
  });
}

const agree = audited.filter((a) => a.geminiWouldQuarantine === a.sonnetWouldQuarantine);
const disagree = audited.filter((a) => a.geminiWouldQuarantine !== a.sonnetWouldQuarantine);
const geminiOnly = disagree.filter((a) => a.geminiWouldQuarantine);
const sonnetOnly = disagree.filter((a) => a.sonnetWouldQuarantine);

console.log('');
console.log('══════════════════════════════════════════');
console.log('■ Gemini 표본 감사 결과');
console.log('══════════════════════════════════════════');
console.log(`감사한 표본 ${audited.length}건 / 호출 ${tokens.calls}회 / 토큰 ${tokens.total}`);
if (stoppedBy) console.log(`★ 중간에 멈췄다: ${stoppedBy}`);
console.log('');
console.log(`  일치     ${agree.length}건`);
console.log(`  불일치   ${disagree.length}건`);
console.log(`    · Gemini 만 문제 삼음  ${geminiOnly.length}건`);
console.log(`    · Sonnet 만 문제 삼음  ${sonnetOnly.length}건`);

if (audited.length < AUDIT_ALERT.minSample) {
  console.log('');
  console.log(
    `★ 표본이 ${audited.length}건이다 (기준 ${AUDIT_ALERT.minSample}건). 일치율 판정을 하지 않았다.`,
  );
} else {
  const rate = disagree.length / audited.length;
  console.log('');
  console.log(
    `  불일치율 ${(rate * 100).toFixed(1)}% (기준 ${(AUDIT_ALERT.disagreeRate * 100).toFixed(0)}%)`,
  );
  if (rate > AUDIT_ALERT.disagreeRate) {
    console.log('');
    console.log('★★ 불일치율이 기준을 넘었다. **작업을 멈추고 표본을 읽어야 한다.**');
    console.log('   ★ 다만 이것이 "Sonnet 이 틀렸다" 를 뜻하지 않는다.');
    console.log('     ★ Gemini 오판 실측 — R010 정상 6건 전부 오탈락 / R012 탈락 3건 중 2건 오탈락');
    console.log('   ★ 셋 중 하나다 —');
    console.log('     (a) 문제 품질이 실제로 낮다');
    console.log('     (b) Sonnet 판정이 느슨해졌다');
    console.log('     (c) ★ Gemini 가 오판하고 있다 (가장 흔한 경우다)');
    console.log('   ★★ 판단은 사람이 한다. 이 스크립트는 어떤 항목도 수정하지 않았다.');
  } else {
    console.log('★ 기준 안이다. Sonnet 판정이 한쪽으로 치우쳤다는 신호는 없다.');
  }
}

if (disagree.length > 0) {
  console.log('');
  console.log('── 불일치 항목 (숫자만으로는 원인을 알 수 없다)');
  for (const a of disagree) {
    console.log('');
    console.log(`  [${a.ref}] ${a.batch}`);
    console.log(`    Q. ${a.question}`);
    console.log(`    우리 정답: ${a.displayAnswer}  (${a.answers.join(' / ')})`);
    console.log(`    Sonnet: ${a.sonnetAnswer ?? '?'} → ${a.sonnetResult ?? '?'}`);
    console.log(`    Gemini: ${a.geminiAnswer} → ${a.geminiResult} [${a.geminiModel}]`);
    if (a.geminiQuestionIssue) console.log('    ★ Gemini 가 질문 문장 문제를 지적했다');
    if (a.geminiNote) console.log(`    사유: ${a.geminiNote}`);
  }
}

// ── 5. 기록. ★ 회차별로 쌓아 추세를 본다
const outDir = path.join(ROOT, 'data/pipeline/audit');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, 'gemini-audit-results.json');
let history = [];
try {
  history = JSON.parse(await readFile(outFile, 'utf8'));
  if (!Array.isArray(history)) history = [];
} catch {
  /* 첫 실행 */
}
history.push({
  at: new Date().toISOString(),
  promptVersion: PROMPT_VERSION,
  poolSize: pool.length,
  sampleRequested: SAMPLE,
  audited: audited.length,
  agree: agree.length,
  disagree: disagree.length,
  geminiOnly: geminiOnly.length,
  sonnetOnly: sonnetOnly.length,
  disagreeRate: audited.length > 0 ? disagree.length / audited.length : null,
  alerted: audited.length >= AUDIT_ALERT.minSample && disagree.length / audited.length > AUDIT_ALERT.disagreeRate,
  tokens,
  stoppedBy,
  disagreements: disagree.map((a) => ({
    ref: a.ref,
    question: a.question,
    ourAnswers: a.answers,
    sonnet: { answer: a.sonnetAnswer, result: a.sonnetResult },
    gemini: { answer: a.geminiAnswer, result: a.geminiResult, model: a.geminiModel, note: a.geminiNote },
  })),
});
await writeFile(outFile, JSON.stringify(history, null, 2) + '\n', 'utf8');

console.log('');
console.log(`[au] 기록: ${path.relative(ROOT, outFile)} (${history.length}회차)`);
if (history.length > 1) {
  console.log('[au] 회차별 불일치율:');
  for (const h of history) {
    const r = h.disagreeRate === null ? '—' : `${(h.disagreeRate * 100).toFixed(1)}%`;
    console.log(`  ${h.at.slice(0, 16)}  표본 ${h.audited}  불일치 ${h.disagree}  ${r}${h.alerted ? '  ★ 경고' : ''}`);
  }
}
console.log('[au] ★★ 이 스크립트는 배치 파일을 수정하지 않았다. 감사는 신호일 뿐이다.');
