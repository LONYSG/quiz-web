#!/usr/bin/env node
// =============================================================================
// LLM 중복 판정 (R012 작업 D-2 / D-3)
//
// ★ 흐름
//   1. 저장된 배치들을 읽는다
//   2. 정규화한 정답으로 후보를 좁힌다 (규칙 기반. 무료. 32,896쌍 → 12쌍)
//   3. ★ 후보 쌍을 한 호출에 묶어 LLM 에게 묻는다
//   4. 판정을 파일에 저장한다. ★ 자동으로 버리지 않는다
//
// ★ 생성에 쓴 모델로 판정하지 않는다 (지시).
//   자기가 만든 두 문제를 자기가 "다르다" 고 할 유인이 있다.
//
// 사용법
//   node scripts/pipeline-dedupe.mjs                    processed/ 전체
//   node scripts/pipeline-dedupe.mjs --files a.json,b.json
//   node scripts/pipeline-dedupe.mjs --dry-run          후보만 보고 끝낸다 (API 미호출)
//   node scripts/pipeline-dedupe.mjs --verify-r011      ★ R011 12쌍으로 판정 정확도를 측정한다
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS, MODELS } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient } from '../pipeline/dist/gemini.js';
import { categoryPath } from '../pipeline/dist/categories.js';
import { findDuplicates } from '../pipeline/dist/dedupe.js';
import {
  DUPE_JUDGE_SCHEMA,
  buildDupeJudgePrompt,
  toDupeQuestionPairs,
} from '../pipeline/dist/dedupe-llm.js';

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
const DRY = args.includes('--dry-run');
const VERIFY_R011 = args.includes('--verify-r011');
const ONLY_FILES = (opt('--files', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PAIRS_PER_CALL = Number(opt('--group', '20'));

// ★ 판정 모델: 생성에 쓰지 않은 쪽을 쓴다.
//   생성은 processChain(3.8/3.7/3.6)이 하므로 판정은 backcheckChain 을 쓴다.
const JUDGE_CHAIN = [...MODELS.backcheckChain];

// ─────────────────────────────────────────────────────────────────────────────
// 1. 배치 읽기
// ─────────────────────────────────────────────────────────────────────────────
const dir = path.join(ROOT, DATA_DIRS.processed);
let files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
if (VERIFY_R011) {
  // ★ R011 배치만 본다. 건우가 정답을 알려준 12쌍이 여기서 나온다
  files = files.filter((f) => f.startsWith('2026-09-09-gen'));
} else if (ONLY_FILES.length > 0) {
  files = files.filter((f) => ONLY_FILES.includes(f));
}

const items = [];
for (const f of files) {
  const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  for (const i of d.items ?? []) {
    if (i.verdict === 'accept' && i.generated?.questionKo) items.push({ ...i, _file: f });
  }
}
console.log(`[dd] 파일 ${files.length}개 / 통과 문제 ${items.length}건`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. 후보 추리기 (무료)
// ─────────────────────────────────────────────────────────────────────────────
const report = findDuplicates(
  items.map((i) => ({
    ref: i.sourceRef,
    midKey: i.gen?.midKey ?? '',
    majorKey: i.gen?.majorKey ?? '',
    question: i.generated.questionKo,
    answers: i.generated.answers,
  })),
);
console.log(
  `[dd] 전수 비교라면 ${report.totalPairsIfBruteForce}쌍 / ★ 정답으로 좁힌 후보 ${report.candidatePairs}쌍` +
    ` (${((report.candidatePairs / Math.max(1, report.totalPairsIfBruteForce)) * 100).toFixed(3)}%)`,
);

const byRef = new Map(items.map((i) => [i.sourceRef, i]));
const questionPairs = toDupeQuestionPairs(report.pairs, (ref) => {
  const i = byRef.get(ref);
  if (!i) return undefined;
  return {
    question: i.generated.questionKo,
    answer: i.generated.displayAnswer,
    category: categoryPath(i.gen?.midKey ?? '', i.gen?.sub),
    accessibility: i.gen?.accessibility ?? 0,
    worthKnowing: i.gen?.worthKnowing ?? 0,
    answerCount: i.generated.answers.length,
  };
});

if (questionPairs.length === 0) {
  console.log('[dd] 후보가 없다. 판정할 것이 없다.');
  process.exit(0);
}

for (const p of questionPairs) {
  console.log(`  ${p.pairId} [${p.level}] "${p.sharedAnswer}"`);
  console.log(`     A. ${p.a.question}`);
  console.log(`     B. ${p.b.question}`);
}

if (DRY) {
  console.log('\n[dd] --dry-run 이므로 LLM 을 호출하지 않는다.');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LLM 판정
// ─────────────────────────────────────────────────────────────────────────────
const state = await loadState(ROOT);
const gate = checkGate(state);
if (!gate.ok) {
  console.error(`[dd] ★ 시작하지 않는다 — ${gate.detail}`);
  process.exit(0);
}

const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const judgements = [];
let usedModel = JUDGE_CHAIN[0];
const tokens = { total: 0, calls: 0 };

for (let i = 0; i < questionPairs.length; i += PAIRS_PER_CALL) {
  const chunk = questionPairs.slice(i, i + PAIRS_PER_CALL);
  const r = await client.generateWithChain(
    JUDGE_CHAIN,
    buildDupeJudgePrompt(chunk),
    DUPE_JUDGE_SCHEMA,
    { maxOutputTokens: 8192 },
  );
  usedModel = r.model;
  tokens.total += r.usage.total;
  tokens.calls += 1;
  console.log(`[dd] 판정 ${i + 1}~${i + chunk.length}/${questionPairs.length} [${r.model}] (토큰 ${r.usage.total})`);
  judgements.push(...(r.value.items ?? []));
}
closeSegment(state, false);
await saveState(ROOT, state);

// ─────────────────────────────────────────────────────────────────────────────
// 4. 결과 저장 (★ 자동으로 버리지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
const byPair = new Map(judgements.map((j) => [j.pairId, j]));
const rows = questionPairs.map((p) => {
  const j = byPair.get(p.pairId);
  const a = byRef.get(p.a.ref);
  const b = byRef.get(p.b.ref);
  return {
    pairId: p.pairId,
    level: p.level,
    sharedAnswer: p.sharedAnswer,
    a: { ref: p.a.ref, file: a?._file, question: p.a.question, answer: p.a.answer, category: p.a.category },
    b: { ref: p.b.ref, file: b?._file, question: p.b.question, answer: p.b.answer, category: p.b.category },
    verdict: j?.verdict ?? 'unsure',
    reason: j?.reason ?? '★ 모델이 이 쌍을 판정하지 않았다',
    keep: j?.keep && j.keep !== 'none' ? j.keep : '',
    keepReason: j?.keepReason ?? '',
    mergeAnswers: j?.mergeAnswers ?? [],
    confidence: j?.confidence ?? 0,
    // ★ 사람이 결정하는 칸. 자동으로 채우지 않는다
    humanDecision: null,
  };
});

const outDir = path.join(ROOT, 'data/pipeline/dedupe');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, VERIFY_R011 ? 'R011-verify.json' : `${new Date().toISOString().slice(0, 10)}-dedupe.json`);
await writeFile(
  outFile,
  JSON.stringify(
    {
      _meta: {
        judgedAt: new Date().toISOString(),
        judgeModel: usedModel,
        // ★ 생성 모델과 판정 모델이 달라야 한다. 기록으로 남긴다
        note: '★ 생성에 쓴 모델(processChain)과 다른 체인(backcheckChain)으로 판정했다',
        files,
        items: items.length,
        totalPairsIfBruteForce: report.totalPairsIfBruteForce,
        candidatePairs: report.candidatePairs,
        tokens,
        counts: rows.reduce((m, r) => {
          m[r.verdict] = (m[r.verdict] ?? 0) + 1;
          return m;
        }, {}),
      },
      pairs: rows,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('\n──────────────────────────────────────────');
const counts = rows.reduce((m, r) => {
  m[r.verdict] = (m[r.verdict] ?? 0) + 1;
  return m;
}, {});
console.log(`[dd] 판정: ${JSON.stringify(counts)}`);
console.log(`[dd] 판정 모델: ${usedModel} / 토큰 ${tokens.total} / 호출 ${tokens.calls}회`);
for (const r of rows) {
  console.log(`  ${r.pairId} ${r.verdict}(${r.confidence}) "${r.sharedAnswer}" → ${r.reason}`);
  if (r.verdict === 'same') {
    console.log(`     남길 쪽: ${r.keep.toUpperCase()} — ${r.keepReason}`);
    if (r.mergeAnswers.length > 0) console.log(`     ★ 합칠 표기: ${r.mergeAnswers.join(', ')}`);
  }
}
console.log(`\n[dd] 저장: ${path.relative(ROOT, outFile)}`);
console.log('[dd] ★ 자동으로 버리지 않았다. humanDecision 이 null 이다 — 사람이 결정한다.');

// ─────────────────────────────────────────────────────────────────────────────
// 5. ★ R011 12쌍 검증 (건우가 정답을 알려준 것)
// ─────────────────────────────────────────────────────────────────────────────
if (VERIFY_R011) {
  // ★ 건우 판정: "'포르투갈어' 말고는 전부 중복이다"
  //   → 정답이 포르투갈어인 쌍만 different, 나머지는 same 이어야 한다
  let correct = 0;
  const wrong = [];
  for (const r of rows) {
    const expected = r.sharedAnswer.includes('포르투갈어') ? 'different' : 'same';
    if (r.verdict === expected) correct += 1;
    else wrong.push({ ...r, expected });
  }
  console.log('\n══════════════════════════════════════════');
  console.log('★ R011 12쌍 검증 (건우 판정과 대조)');
  console.log('══════════════════════════════════════════');
  console.log(`기준: "포르투갈어" 쌍만 different, 나머지는 same (건우 검수 결과)`);
  console.log(`★ 일치 ${correct}/${rows.length} (${((correct / rows.length) * 100).toFixed(1)}%)`);
  if (wrong.length > 0) {
    console.log('\n★ 어긋난 판정:');
    for (const w of wrong) {
      console.log(`  ${w.pairId} "${w.sharedAnswer}": 모델 ${w.verdict} / 건우 ${w.expected}`);
      console.log(`     A. ${w.a.question}`);
      console.log(`     B. ${w.b.question}`);
      console.log(`     모델 이유: ${w.reason}`);
    }
  }
}
