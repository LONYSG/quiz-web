#!/usr/bin/env node
// =============================================================================
// 배치 실측 집계 (작업 H)
//
// ★ processed/ 의 모든 배치를 모아 단계별 통과·탈락과 품질 지표를 계산한다.
//   ★ "LLM 에 실제로 도달한 건수" 를 분모로 쓴다.
//     429 로 중단된 배치의 손대지 않은 건수를 분모에 넣으면 생존율이 거짓으로 낮아진다.
//
// 사용법
//   npm run pipeline:report
//   npm run pipeline:report -- --samples 10    복수 정답 표본을 더 보여준다
// =============================================================================

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIRS } from '../pipeline/dist/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const SAMPLES = Number(opt('--samples', '6'));

const files = [];
async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (e.name.endsWith('.json')) files.push(full);
  }
}
await walk(path.join(ROOT, DATA_DIRS.processed));

if (files.length === 0) {
  console.log('[report] processed/ 에 배치가 없다.');
  process.exit(0);
}

const items = [];
const meta = [];
for (const f of files.sort()) {
  const batch = JSON.parse(await readFile(f, 'utf8'));
  meta.push({ file: path.relative(ROOT, f), ...batch._meta });
  for (const item of batch.items ?? []) items.push(item);
}

// ── 단계별 집계
// ★ 규칙 필터에서 탈락한 것은 LLM 을 보지 않았다. 별도로 센다.
const filtered = items.filter((i) => i.rejectedAt === 'filter');
const reachedLlm = items.filter((i) => i.rejectedAt !== 'filter');
// ★ 429 로 손대지 않은 건수는 결과 파일에 아예 없다(청크 단위로 중단하므로).
//   따라서 reachedLlm 이 실제로 LLM 을 지난 건수다.
const aiRejected = items.filter((i) => i.rejectedAt === 'ai');
const bcRejected = items.filter((i) => i.rejectedAt === 'backcheck');
const rulesRejected = items.filter((i) => i.rejectedAt === 'rules');
const accepted = items.filter((i) => i.verdict === 'accept');

const pct = (n, d) => (d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '-');

console.log('════ 배치 실측 집계 ════');
console.log(`배치 파일 ${files.length}개 / 기록된 항목 ${items.length}건\n`);

console.log('── 단계별 (분모: 각 단계에 실제로 도달한 건수)');
console.log(`  수집·기록된 항목        ${items.length}`);
console.log(`  규칙 필터 탈락          ${filtered.length}  (${pct(filtered.length, items.length)})`);
console.log(`  ★ LLM 에 도달           ${reachedLlm.length}`);
console.log(`  1차 가공 탈락           ${aiRejected.length}  (${pct(aiRejected.length, reachedLlm.length)} of LLM)`);
console.log(`  역검증 탈락             ${bcRejected.length}  (${pct(bcRejected.length, reachedLlm.length)} of LLM)`);
console.log(`  규칙 검사 탈락          ${rulesRejected.length}  (${pct(rulesRejected.length, reachedLlm.length)} of LLM)`);
console.log(`  ★ 최종 통과             ${accepted.length}`);
console.log('');
console.log(`★ 생존율 (전체 기준)      ${pct(accepted.length, items.length)}`);
console.log(`★ 생존율 (LLM 도달 기준)  ${pct(accepted.length, reachedLlm.length)}`);

// ── 탈락 사유 분포
const reasons = {};
for (const i of items) {
  if (i.verdict === 'accept') continue;
  for (const r of i.rejectReasons ?? []) reasons[r] = (reasons[r] ?? 0) + 1;
}
console.log('\n── 탈락 사유 분포');
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

// ── 토큰
const tokens = meta.reduce(
  (a, m) => ({
    total: a.total + (m.tokens?.total ?? 0),
    prompt: a.prompt + (m.tokens?.prompt ?? 0),
    output: a.output + (m.tokens?.output ?? 0),
    thoughts: a.thoughts + (m.tokens?.thoughts ?? 0),
    calls: a.calls + (m.tokens?.calls ?? 0),
  }),
  { total: 0, prompt: 0, output: 0, thoughts: 0, calls: 0 },
);
console.log('\n── 토큰 사용량');
console.log(`  총 ${tokens.total} (프롬프트 ${tokens.prompt} / 출력 ${tokens.output} / 사고 ${tokens.thoughts})`);
console.log(`  호출 ${tokens.calls}회`);
if (reachedLlm.length > 0) {
  console.log(`  ★ LLM 도달 1건당 평균 ${Math.round(tokens.total / reachedLlm.length)}토큰`);
}
if (tokens.total > 0) {
  console.log(`  ★ 사고 토큰 비중 ${pct(tokens.thoughts, tokens.total)}`);
}

// ── 실제 사용 모델
const modelUse = {};
for (const i of items) {
  if (i.meta?.processModel) modelUse[i.meta.processModel] = (modelUse[i.meta.processModel] ?? 0) + 1;
}
console.log('\n── 실제로 가공한 모델 (항목 수)');
for (const [k, v] of Object.entries(modelUse).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

// ── 복수 정답 품질 (★ 이 파이프라인의 가장 중요한 산출물)
if (accepted.length > 0) {
  const counts = accepted.map((i) => i.generated.answers.length);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  console.log('\n── ★ 복수 정답 배열 품질');
  console.log(`  평균 ${avg.toFixed(1)}개 / 최소 ${Math.min(...counts)} / 최대 ${Math.max(...counts)}`);
  const dist = {};
  for (const c of counts) dist[c] = (dist[c] ?? 0) + 1;
  console.log(`  분포: ${Object.entries(dist).sort((a,b)=>Number(a[0])-Number(b[0])).map(([k, v]) => `${k}개:${v}건`).join(' / ')}`);

  console.log('\n── ★ 통과 문제 표본 (사람이 직접 품질을 평가해야 한다)');
  for (const i of accepted.slice(0, SAMPLES)) {
    const g = i.generated;
    console.log(`\n  [${i.sourceRef}]  ${i.meta.processModel}`);
    console.log(`    원문: ${i.source.question}`);
    console.log(`    원정답: ${i.source.correct}`);
    console.log(`    한국어: ${g.questionKo}`);
    console.log(`    대표정답: ${g.displayAnswer}`);
    console.log(`    변형(${g.answers.length}): ${JSON.stringify(g.answers)}`);
    console.log(`    분류: ${g.category} / ${g.difficulty} / krAccessible=${i.ai.krAccessible}`);
    if (g.explanation) console.log(`    해설: ${g.explanation}`);
    console.log(`    역검증: ${i.backcheck.result} (답 "${i.backcheck.answer}", conf ${i.backcheck.confidence})`);
    if (i.review.note) console.log(`    ★ 검수 메모: ${i.review.note}`);
  }
}

// ── ★ false reject 검토 대상 (E-1)
const bcSamples = bcRejected.slice(0, SAMPLES);
if (bcSamples.length) {
  console.log('\n── ★ 역검증 탈락 표본 (false reject 검토 대상)');
  for (const i of bcSamples) {
    console.log(`\n  [${i.sourceRef}] ${i.rejectReasons.join(',')}`);
    console.log(`    원문: ${i.source.question}`);
    console.log(`    원정답: ${i.source.correct}`);
    console.log(`    한국어: ${i.generated?.questionKo ?? '(없음)'}`);
    console.log(`    우리 정답: ${JSON.stringify(i.generated?.answers ?? [])}`);
    console.log(`    역검증 답: "${i.backcheck?.answer ?? ''}" (conf ${i.backcheck?.confidence ?? '-'})`);
    if (i.backcheck?.alternatives?.length) {
      console.log(`    대안: ${JSON.stringify(i.backcheck.alternatives)}`);
    }
    console.log(`    사유: ${i.backcheck?.note ?? ''}`);
  }
}

// ── AI 탈락 표본
const aiSamples = aiRejected.slice(0, SAMPLES);
if (aiSamples.length) {
  console.log('\n── 1차 가공 탈락 표본 (사유 확인)');
  for (const i of aiSamples) {
    console.log(`  [${i.rejectReasons.join(',')}] ${i.source.question.slice(0, 90)}`);
    console.log(`     원정답: ${i.source.correct} / krAccessible=${i.ai?.krAccessible ?? '-'}`);
    if (i.ai?.rejectReason) console.log(`     모델 사유: ${i.ai.rejectReason}`);
  }
}

// ── 확보 가능량 추산
console.log('\n── ★ 확보 가능량 추산');
const survival = reachedLlm.length > 0 ? accepted.length / items.length : 0;
console.log(`  실측 생존율 ${(survival * 100).toFixed(1)}% (표본 ${items.length}건)`);
console.log(`  OpenTDB multiple 타입 (R002 실측) 4,500건`);
console.log(`  → 확보 가능 추산 약 ${Math.round(4500 * survival)}건`);
console.log(`  ★ Q-46 목표는 실플레이 1,000건 이상이다.`);
console.log(
  `  ★ 표본이 ${items.length}건이므로 이 추산의 신뢰구간은 넓다. 참고값으로만 쓴다.`,
);
