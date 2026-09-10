#!/usr/bin/env node
// =============================================================================
// 역검증 회귀 측정 (R013 작업 A-2)
//
// ★★ 무엇을 재는가
//   ★ 잡아야 할 것(R012의 4건)을 잡는가        → 재현율
//   ★ 잡지 말아야 할 것(정상 12건)을 안 잡는가  → 오탐률
//   ★ 둘은 다른 문제다. 하나만 재면 프롬프트를 잘못 고친다 —
//     "무조건 지적하라" 로 만들면 재현율은 100%가 되고 오탐률도 100%가 된다.
//
// ★ 프롬프트를 바꿀 때마다 돌린다. 회차별 결과를 파일에 누적한다.
//
// 사용법
//   node scripts/pipeline-backcheck-regression.mjs
//   node scripts/pipeline-backcheck-regression.mjs --label "p3 1회차"
//   node scripts/pipeline-backcheck-regression.mjs --model gemini-3.6-flash
// =============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODELS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient } from '../pipeline/dist/gemini.js';
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
const LABEL = opt('--label', `${PROMPT_VERSION} ${new Date().toISOString().slice(11, 16)}`);
const MODEL = opt('--model', '');

const specFile = path.join(ROOT, 'data/pipeline/regression/backcheck-p3.json');
const spec = JSON.parse(await readFile(specFile, 'utf8'));

// ★ 한 호출에 전부 넣는다. 순서를 섞어 위치 편향을 줄인다
//   ★ 잡아야 할 것을 앞에 몰아 두면 모델이 "이 목록은 오류 목록이다" 로 학습할 수 있다
const all = [
  ...spec.shouldCatch.map((x) => ({ ...x, kind: 'catch' })),
  ...spec.shouldNotCatch.map((x) => ({ ...x, kind: 'nocatch' })),
];
// 결정적으로 섞는다 (id 해시 순). ★ 매 회차 같은 순서여야 비교가 성립한다
all.sort((a, b) => {
  const h = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100003, 7);
  return h(a.id) - h(b.id);
});

console.log(`[rg] 회귀 자료 ${all.length}건 (잡아야 할 것 ${spec.shouldCatch.length} / 정상 ${spec.shouldNotCatch.length})`);
console.log(`[rg] 프롬프트: ${PROMPT_VERSION} / 라벨: ${LABEL}`);

const state = await loadState(ROOT);
const gate = checkGate(state);
if (!gate.ok) {
  console.error(`[rg] ★ 시작하지 않는다 — ${gate.detail}`);
  process.exit(0);
}
const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const chain = MODEL ? [MODEL] : [...MODELS.backcheckChain];

const r = await client.generateWithChain(
  chain,
  buildBackcheckPrompt(all.map((x) => ({ sourceRef: x.id, questionKo: x.question }))),
  BACKCHECK_SCHEMA,
  { maxOutputTokens: 8192 },
);
closeSegment(state, false);
await saveState(ROOT, state);
console.log(`[rg] 호출 완료 [${r.model}] (토큰 ${r.usage.total})`);

const byRef = new Map((r.value.items ?? []).map((x) => [x.sourceRef, x]));

// ─────────────────────────────────────────────────────────────────────────────
// 채점
// ─────────────────────────────────────────────────────────────────────────────
const rows = [];
let caught = 0;
let missed = 0;
let falsePositives = 0;
let cleanOk = 0;

for (const x of all) {
  const raw = byRef.get(x.id);
  if (!raw) {
    rows.push({ ...x, status: 'no_response', detail: '★ 모델이 이 항목을 돌려주지 않았다' });
    if (x.kind === 'catch') missed += 1;
    continue;
  }
  const judged = judgeBackcheck(raw, x.answers);
  const f = judged.result.factualIssues ?? [];
  const u = judged.result.uniquenessIssue ?? [];
  const s = judged.result.spellingIssues ?? [];
  const flagged = { factualIssues: f, uniquenessIssue: u, spellingIssues: s };
  const any = f.length > 0 || u.length > 0 || s.length > 0;

  if (x.kind === 'catch') {
    // ★ 기대한 종류의 필드가 채워졌는지 본다.
    //   ★ 다른 필드에서 잡은 것도 "잡았다" 로 세되 그 사실을 표시한다 —
    //     오류를 발견한 것은 맞으므로 완전한 실패는 아니다
    const expected = flagged[x.expect] ?? [];
    if (expected.length > 0) {
      caught += 1;
      rows.push({ ...x, status: 'caught', flagged, answer: judged.result.answer });
    } else if (any) {
      caught += 1;
      rows.push({
        ...x,
        status: 'caught_wrong_field',
        flagged,
        answer: judged.result.answer,
        detail: `★ 오류는 잡았으나 ${x.expect} 가 아닌 다른 필드에 넣었다`,
      });
    } else {
      missed += 1;
      rows.push({ ...x, status: 'missed', flagged, answer: judged.result.answer });
    }
  } else {
    if (any) {
      falsePositives += 1;
      rows.push({ ...x, status: 'false_positive', flagged, answer: judged.result.answer });
    } else {
      cleanOk += 1;
      rows.push({ ...x, status: 'clean', flagged, answer: judged.result.answer });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 보고
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`■ 채점 결과 — ${LABEL} [${r.model}]`);
console.log('══════════════════════════════════════════');
console.log(`★ 재현율: ${caught}/${spec.shouldCatch.length} 잡음  (놓침 ${missed})`);
console.log(`★ 오탐:   ${falsePositives}/${spec.shouldNotCatch.length}  (정상 판정 ${cleanOk})`);
console.log('');

console.log('── 잡아야 할 것');
for (const row of rows.filter((x) => x.kind === 'catch')) {
  const mark = row.status === 'caught' ? '○' : row.status === 'caught_wrong_field' ? '△' : '★ ✗';
  console.log(`  ${mark} ${row.id} (${row.expect})`);
  console.log(`     기대: ${row.whatIsWrong}`);
  if (row.flagged) {
    for (const [k, v] of Object.entries(row.flagged)) {
      if (v.length > 0) console.log(`     모델 ${k}: ${v.join(' / ')}`);
    }
  }
  if (row.detail) console.log(`     ${row.detail}`);
}

console.log('');
console.log('── 정상 (오탐 검사)');
for (const row of rows.filter((x) => x.kind === 'nocatch')) {
  if (row.status === 'clean') continue;
  console.log(`  ★ 오탐 ${row.id}`);
  console.log(`     Q. ${row.question}`);
  for (const [k, v] of Object.entries(row.flagged ?? {})) {
    if (v.length > 0) console.log(`     모델 ${k}: ${v.join(' / ')}`);
  }
}
if (falsePositives === 0) console.log('  ★ 오탐 없음');

// ── 결과 누적 저장
const outDir = path.join(ROOT, 'data/pipeline/regression');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, 'backcheck-p3-results.json');
let history = { runs: [] };
try {
  history = JSON.parse(await readFile(outFile, 'utf8'));
} catch {
  /* 첫 실행 */
}
history.runs.push({
  label: LABEL,
  at: new Date().toISOString(),
  promptVersion: PROMPT_VERSION,
  model: r.model,
  tokens: r.usage.total,
  recall: { caught, missed, total: spec.shouldCatch.length },
  falsePositive: { count: falsePositives, clean: cleanOk, total: spec.shouldNotCatch.length },
  rows: rows.map((x) => ({
    id: x.id,
    kind: x.kind,
    status: x.status,
    expect: x.expect ?? null,
    flagged: x.flagged ?? null,
    answer: x.answer ?? null,
  })),
});
await writeFile(outFile, JSON.stringify(history, null, 2) + '\n', 'utf8');
console.log(`\n[rg] 저장: ${path.relative(ROOT, outFile)} (회차 ${history.runs.length})`);

if (history.runs.length > 1) {
  console.log('\n── 회차별 추이');
  for (const run of history.runs) {
    console.log(
      `  ${run.label.padEnd(18)} [${(run.model ?? '').padEnd(22)}] ` +
        `재현 ${run.recall.caught}/${run.recall.total} / 오탐 ${run.falsePositive.count}/${run.falsePositive.total}`,
    );
  }
}
