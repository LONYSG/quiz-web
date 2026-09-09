#!/usr/bin/env node
// =============================================================================
// Gemini 생성분 → Claude Code 역검증 결과 적용 (R012 작업 A-3)
//
// ★★ 검증 방향이 반대다.
//   pipeline-claude-verify.mjs   Claude Code 생성분 → Gemini 가 역검증 (API 호출)
//   이 스크립트                   Gemini 생성분 → ★ Claude Code 가 역검증 (API 호출 없음)
//
// ★ Claude Code 는 스크립트가 부를 수 있는 모델이 아니다. 그래서 역검증 답안을
//   파일(_backcheck-gemini.json)로 받아 **같은 판정 함수**에 넣는다.
//   ★ judgeBackcheck 는 R010에서 고친 그 함수 그대로다. 판정 조건을 바꾸지 않는다.
//   ★ 조건을 바꾸면 비교가 성립하지 않는다.
//
// 사용법
//   node scripts/pipeline-gemini-verify.mjs
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';
import { judgeBackcheck } from '../pipeline/dist/process.js';
import { checkRules } from '../pipeline/dist/rules.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const geminiFile = path.join(ROOT, DATA_DIRS.processed, '2026-09-10-compare-gemini.json');
const bcFile = path.join(ROOT, 'data/pipeline/claude-gen/_backcheck-gemini.json');

const batch = JSON.parse(await readFile(geminiFile, 'utf8'));
const bc = JSON.parse(await readFile(bcFile, 'utf8'));
const byRef = new Map(bc.items.map((b) => [b.sourceRef, b]));

console.log(`[gv] Gemini 생성분 ${batch.items.length}건 / Claude Code 역검증 답안 ${bc.items.length}건`);

// ★ 답안이 빠진 항목이 있으면 알린다. 조용히 넘기지 않는다.
const missing = batch.items.filter((i) => i.generated?.questionKo && !byRef.has(i.sourceRef));
if (missing.length > 0) {
  console.error(`[gv] ★ 역검증 답안이 없는 항목 ${missing.length}건:`);
  for (const m of missing) console.error(`   ${m.sourceRef} | ${m.generated.questionKo}`);
  process.exit(1);
}

const stats = {
  input: 0,
  pass: 0,
  needsReview: 0,
  backcheckRejected: 0,
  rulesRejected: 0,
  accepted: 0,
  reasons: {},
  // ★ 어떤 종류의 불일치였는지 따로 센다. 비교 보고에 쓴다
  mismatch: [],
  ambiguous: [],
  outsideAlternatives: [],
};
const bump = (k) => {
  stats.reasons[k] = (stats.reasons[k] ?? 0) + 1;
};

for (const item of batch.items) {
  if (!item.generated?.questionKo) continue;
  stats.input += 1;

  const raw = byRef.get(item.sourceRef);
  const judged = judgeBackcheck(raw, item.generated.answers);

  // ★ Gemini 자기 역검증 결과를 지우고 Claude Code 판정으로 덮는다.
  //   ★ 원래 결과는 backcheckBySelf 에 남겨 둔다. 비교의 근거다.
  item.backcheckBySelf = item.backcheck;
  item.backcheck = judged.result;
  item.meta.backcheckModel = 'claude-code';

  if (judged.result.result === 'ambiguous') stats.ambiguous.push(item.sourceRef);
  if (judged.result.result === 'mismatch') stats.mismatch.push(item.sourceRef);
  if (judged.needsReview) {
    stats.needsReview += 1;
    stats.outsideAlternatives.push(item.sourceRef);
  }

  // 판정 초기화 후 다시 계산한다
  item.verdict = 'reject';
  item.rejectedAt = null;
  item.rejectReasons = [];

  if (judged.reject) {
    item.rejectedAt = 'backcheck';
    item.rejectReasons = [`backcheck_${judged.result.result}`];
    bump(`backcheck_${judged.result.result}`);
    stats.backcheckRejected += 1;
    continue;
  }

  const rules = checkRules(item.generated);
  item.rules = rules;
  if (!rules.pass) {
    item.rejectedAt = 'rules';
    item.rejectReasons = rules.reasons;
    for (const r of rules.reasons) bump(r);
    stats.rulesRejected += 1;
    continue;
  }

  item.verdict = 'accept';
  if (judged.needsReview) {
    item.review.note = judged.result.note;
  }
  stats.accepted += 1;
}

batch._meta.verifier = 'claude-code';
batch._meta.verifiedAt = new Date().toISOString();
batch._meta.crossVerify = {
  method: '질문만 보고 Claude Code 가 답한 뒤 judgeBackcheck 로 판정했다',
  counts: {
    input: stats.input,
    accepted: stats.accepted,
    backcheckRejected: stats.backcheckRejected,
    rulesRejected: stats.rulesRejected,
    needsReview: stats.needsReview,
  },
  reasons: stats.reasons,
  mismatchRefs: stats.mismatch,
  ambiguousRefs: stats.ambiguous,
  outsideAlternativeRefs: stats.outsideAlternatives,
};

await writeFile(geminiFile, JSON.stringify(batch, null, 2) + '\n', 'utf8');

console.log('\n──────────────────────────────────────────');
console.log(`[gv] 입력 ${stats.input}`);
console.log(`[gv] 역검증 탈락 ${stats.backcheckRejected} (불일치 ${stats.mismatch.length} / 애매 ${stats.ambiguous.length})`);
console.log(`[gv] 규칙 탈락 ${stats.rulesRejected}`);
console.log(`[gv] 집합 밖 대안 제시 ${stats.needsReview}건 (통과하되 검수 대기)`);
console.log(`[gv] ★ 통과 ${stats.accepted}건 (${((stats.accepted / stats.input) * 100).toFixed(1)}%)`);
console.log(`[gv] 탈락 사유: ${JSON.stringify(stats.reasons)}`);
console.log(`[gv] 저장: ${path.relative(ROOT, geminiFile)} (backcheckBySelf 에 Gemini 자기 검증 결과를 남겼다)`);
