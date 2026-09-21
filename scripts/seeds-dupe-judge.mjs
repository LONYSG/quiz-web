#!/usr/bin/env node
// =============================================================================
// 중복 판정 (라운드 중립. R017 에서 r017-dupe-judge.mjs 였다) — 후보 쌍만 Gemini 에게 넘겨 "같은 문제인가" 를 묻는다
//
// ★★ 판정 모델은 생성 모델과 달라야 한다 (D-043 / Q-81).
//   이번 라운드의 생성은 Opus 가 했다. 그래서 판정은 Gemini 가 한다.
//
// ★★ 후보만 넘긴다. 전체를 무식하게 비교하지 않는다.
//   scripts/r017-check.mjs 가 정규화한 정답이 겹치는 쌍만 골라 두었다.
//
// ★ 호출 수를 줄이려고 여러 쌍을 한 호출에 묶는다. 다만 **무한정 묶지 않는다.**
//   ★★ R019 실측: 35쌍을 한 번에 물었더니 세 모델 모두 응답이 중간에 잘렸다.
//     maxOutputTokens 4096 을 넘겨 JSON 이 닫히지 않은 것이다 — 모델 문제가 아니라 한도 문제였다.
//   ★ 그래서 JUDGE_CHUNK 쌍씩 나누어 부르고 결과를 합친다. 한 묶음이 실패하면 그 묶음만 버린다.
// ★ 429 가 나면 그 사실을 파일에 남기고 판정을 다음 라운드로 미룬다. 재시도하지 않는다.
//
// ★ 프롬프트와 스키마는 기존 dedupe-llm 을 **그대로 재사용한다.** 새로 만들지 않는다 —
//   기존 판정(건우 판정과 12/12 일치)과 같은 기준으로 재야 R011 과 비교할 수 있다.
//
// 사용법
//   node scripts/r017-dupe-judge.mjs [r017]
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODELS } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient } from '../pipeline/dist/gemini.js';
import { DUPE_JUDGE_SCHEMA, buildDupeJudgePrompt } from '../pipeline/dist/dedupe-llm.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const ROUND = process.argv[2] ?? 'r017';
const candFile = path.join(ROOT, 'data', 'pipeline', 'dedupe', `${ROUND}-candidates.json`);
const outFile = path.join(ROOT, 'data', 'pipeline', 'dedupe', `${ROUND}-judged.json`);

const cand = JSON.parse(await readFile(candFile, 'utf8'));

// ── 후보 쌍을 LLM 질문 형태로
const pairs = [];
let n = 0;
for (const p of cand.pairsInside) {
  n += 1;
  pairs.push({
    pairId: `in${n}`,
    scope: 'inside',
    sharedAnswer: p.a.ans,
    level: 'same-answer',
    a: { ref: p.a.ref, question: p.a.q, answer: p.a.ans, category: p.a.cat, accessibility: 0, worthKnowing: 0, answerCount: 1 },
    b: { ref: p.b.ref, question: p.b.q, answer: p.b.ans, category: p.b.cat, accessibility: 0, worthKnowing: 0, answerCount: 1 },
  });
}
// ★★ R018: 라운드 간 대조를 더했다. R017 이 재지 못한 "소분류 사이 중복" 이 여기서 드러난다
let x = 0;
for (const c of cand.pairsVsRounds ?? []) {
  for (const p of c.pairs) {
    x += 1;
    pairs.push({
      pairId: `xr${x}`,
      scope: `vs-${c.round}`,
      sharedAnswer: p.a.ans,
      level: 'same-answer',
      a: { ref: p.a.ref, question: p.a.q, answer: p.a.ans, category: p.a.cat, accessibility: 0, worthKnowing: 0, answerCount: 1 },
      b: { ref: p.b.ref, question: p.b.q, answer: p.b.ans, category: p.b.cat, accessibility: 0, worthKnowing: 0, answerCount: 1 },
    });
  }
}

let m = 0;
for (const p of cand.pairsVsDb) {
  m += 1;
  pairs.push({
    pairId: `db${m}`,
    scope: 'vs-db',
    sharedAnswer: p.a.ans,
    level: 'same-answer',
    a: { ref: p.a.ref, question: p.a.q, answer: p.a.ans, category: p.a.cat, accessibility: 0, worthKnowing: 0, answerCount: 1 },
    b: { ref: p.b.ref, question: p.b.q, answer: p.b.ans, category: p.b.cat, accessibility: 0, worthKnowing: 0, answerCount: 1 },
  });
}

console.log(`[입력] 후보 ${pairs.length}쌍 (신규 안쪽 ${n} / 라운드 간 ${x} / 기존 DB ${m})`);
if (pairs.length === 0) {
  await writeFile(outFile, `${JSON.stringify({ round: ROUND, pairs: [], judged: [], note: '후보가 없어 호출하지 않았다' }, null, 2)}\n`, 'utf8');
  console.log('후보가 없다. API 를 호출하지 않는다.');
  process.exit(0);
}

const state = await loadState(ROOT);
const gate = checkGate(state);
if (gate.ok === false) {
  console.error(`[게이트] 진행할 수 없다: ${gate.reason} — ${gate.detail}`);
  await writeFile(outFile, `${JSON.stringify({ round: ROUND, blocked: gate, pairs: pairs.length }, null, 2)}\n`, 'utf8');
  process.exit(3);
}

const client = new GeminiClient({ root: ROOT, state, log: (msg) => console.log(`  ${msg}`) });

// ★ 한 묶음의 크기. 쌍당 응답이 100~150 토큰쯤이므로 12쌍이면 4096 안에 넉넉히 들어간다
const JUDGE_CHUNK = Number(process.env.PIPELINE_JUDGE_CHUNK ?? 12);
const chunks = [];
for (let i = 0; i < pairs.length; i += JUDGE_CHUNK) chunks.push(pairs.slice(i, i + JUDGE_CHUNK));
console.log(`[묶음] ${pairs.length}쌍 → ${chunks.length}묶음 (묶음당 최대 ${JUDGE_CHUNK}쌍)`);

const items = [];
const skippedChunks = [];
const usedModels = [];
let usage = { promptTokens: 0, outputTokens: 0 };
let result = null;
let lastErr = null;

for (const [ci, chunk] of chunks.entries()) {
  const prompt = buildDupeJudgePrompt(chunk);
  console.log(`[묶음 ${ci + 1}/${chunks.length}] ${chunk.length}쌍 / 프롬프트 ${prompt.length}자`);
  let got = null;
  // ★ 판정 체인은 backcheckChain 을 쓴다. 생성에 Opus 를 썼으므로 어느 것이든 다른 모델이다
  for (const model of MODELS.backcheckChain) {
    try {
      console.log(`  [호출] ${model}`);
      got = await client.generate(model, prompt, DUPE_JUDGE_SCHEMA, { temperature: 0, maxOutputTokens: 4096 });
      break;
    } catch (err) {
      lastErr = err;
      console.error(`    실패: ${err.name} ${err.message}`);
      if (err.name === 'RateLimitError' || err.name === 'BudgetError') break;
    }
  }
  if (!got) {
    console.error(`  ★ 묶음 ${ci + 1} 을 판정하지 못했다. 이 묶음은 건너뛴다`);
    skippedChunks.push({ chunk: ci + 1, pairIds: chunk.map((p) => p.pairId), error: String(lastErr?.name ?? 'unknown') });
    if (lastErr?.name === 'RateLimitError' || lastErr?.name === 'BudgetError') break;
    continue;
  }
  usedModels.push(got.model);
  usage.promptTokens += got.usage?.promptTokens ?? 0;
  usage.outputTokens += got.usage?.outputTokens ?? 0;
  items.push(...(got.value.items ?? []));
  result = { model: [...new Set(usedModels)].join(','), usage, attempts: chunks.length, value: { items } };
}

if (!result) {
  closeSegment(state, lastErr?.name === 'RateLimitError');
  await saveState(ROOT, state);
  await writeFile(
    outFile,
    `${JSON.stringify({ round: ROUND, failed: true, error: String(lastErr?.message ?? 'unknown'), pairs: pairs.length, note: '★ 한도에 걸렸다. 판정을 다음 라운드로 미룬다' }, null, 2)}\n`,
    'utf8',
  );
  console.error('\n★ 판정하지 못했다. 다음 라운드로 미룬다.');
  process.exit(4);
}

closeSegment(state, false);
await saveState(ROOT, state);

const byId = new Map(pairs.map((p) => [p.pairId, p]));
// ★★ R020 에서 드러난 것: 묶음 하나가 실패하면 그 쌍들이 **조용히 빠진 채** 판정이 끝났다.
//   ★ 판정되지 않은 쌍을 파일과 화면에 반드시 남긴다. 안 남기면 중복이 그대로 통과한다.
const judgedIds = new Set(items.map((j) => j.pairId));
const unjudged = pairs.filter((p) => !judgedIds.has(p.pairId)).map((p) => ({ pairId: p.pairId, scope: p.scope, a: p.a?.ref, b: p.b?.ref }));
const judged = items.map((j) => {
  const p = byId.get(j.pairId);
  return { ...j, scope: p?.scope ?? '?', a: p?.a, b: p?.b };
});

await writeFile(
  outFile,
  `${JSON.stringify({ round: ROUND, model: result.model, usage: result.usage, judgedAt: new Date().toISOString(), counts: { pairs: pairs.length, inside: n, vsDb: m, judged: judged.length, unjudged: unjudged.length }, skippedChunks, unjudged, judged }, null, 2)}\n`,
  'utf8',
);

console.log(`\n[모델] ${result.model} / 시도 ${result.attempts}회`);
for (const j of judged) {
  console.log(`\n  ${j.pairId} [${j.scope}] → ${j.verdict} (확신 ${j.confidence}) keep=${j.keep}`);
  console.log(`    A ${j.a?.ref}: ${j.a?.question}`);
  console.log(`    B ${j.b?.ref}: ${j.b?.question}`);
  console.log(`    이유: ${j.reason}`);
}
const same = judged.filter((j) => j.verdict === 'same').length;
const unsure = judged.filter((j) => j.verdict === 'unsure').length;
console.log(`\n[요약] same ${same} / different ${judged.length - same - unsure} / unsure ${unsure}`);
console.log(`  → ${path.relative(ROOT, outFile).split(path.sep).join('/')}`);
if (unjudged.length) {
  console.error(`
★★ 판정되지 않은 쌍이 ${unjudged.length}개 있다. 묶음이 실패했다 — 그대로 두면 중복이 통과한다.`);
  for (const u of unjudged) console.error(`   ${u.pairId} [${u.scope}] ${u.a} ↔ ${u.b}`);
  console.error(`   ★ 다시 돌리거나 PIPELINE_JUDGE_CHUNK 를 줄여라.`);
}

