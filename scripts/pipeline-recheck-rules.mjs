#!/usr/bin/env node
// =============================================================================
// 저장된 배치에 규칙 검사를 다시 적용한다 (R012)
//
// ★★ API 호출 0회다. R010의 rejudge(D-035)와 같은 원칙이다 —
//   규칙을 고쳤을 때 데이터를 잃지 않고 효과를 확인할 수 있어야 한다.
//   ★ 저장된 역검증 결과(backcheck)를 그대로 재사용한다.
//
// ★ 규칙 검사만 다시 한다. 역검증 판정은 이미 저장된 것을 쓴다.
//   (역검증을 다시 하려면 API 호출이 필요하고, 그것은 rejudge 의 일이다)
//
// 사용법
//   node scripts/pipeline-recheck-rules.mjs data/pipeline/processed/2026-09-10-compare-claude.json
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkRules, dedupeAnswers, sanitizeVariants } from '../pipeline/dist/rules.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('[rc] 대상 파일을 지정한다.');
  process.exit(1);
}

for (const rel of files) {
  const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const batch = JSON.parse(await readFile(file, 'utf8'));

  const before = batch.items.filter((i) => i.verdict === 'accept').length;
  const stats = { recovered: [], newlyRejected: [], reasons: {} };

  for (const item of batch.items) {
    if (!item.generated?.questionKo) continue;
    // ★ 역검증에서 탈락한 것은 규칙 검사 이전 단계다. 건드리지 않는다.
    if (item.rejectedAt === 'backcheck' || item.rejectedAt === 'ai') continue;

    const wasAccepted = item.verdict === 'accept';

    // ★ 표기 변형 형식 정리를 다시 한다. 규칙이 바뀌면 결과가 달라진다.
    const display = item.generated.displayAnswer;
    const merged = dedupeAnswers([display, ...item.generated.answers]).filter(Boolean);
    const { kept, dropped } = sanitizeVariants(display, merged);
    item.generated.answers = kept;

    const rules = checkRules(item.generated);
    item.rules = rules;

    if (rules.pass) {
      item.verdict = 'accept';
      item.rejectedAt = null;
      item.rejectReasons = [];
      if (!wasAccepted) stats.recovered.push(item);
    } else {
      item.verdict = 'reject';
      item.rejectedAt = 'rules';
      item.rejectReasons = rules.reasons;
      for (const r of rules.reasons) stats.reasons[r] = (stats.reasons[r] ?? 0) + 1;
      if (wasAccepted) stats.newlyRejected.push(item);
    }

    // 메모를 다시 쓴다 (이전 메모의 "제외했다" 부분을 갱신한다)
    const notes = [];
    if (dropped.length > 0) notes.push(`형식에 맞지 않는 표기 변형을 제외했다: ${dropped.join(', ')}`);
    if (item.backcheck?.note) notes.push(item.backcheck.note);
    item.review.note = notes.length > 0 ? notes.join(' / ') : null;
  }

  const after = batch.items.filter((i) => i.verdict === 'accept').length;
  batch._meta.rulesRecheckedAt = new Date().toISOString();
  batch._meta.counts.accepted = after;
  batch._meta.counts.rulesRejected = batch.items.filter((i) => i.rejectedAt === 'rules').length;

  await writeFile(file, JSON.stringify(batch, null, 2) + '\n', 'utf8');

  console.log(`\n[rc] ${path.basename(file)}: 통과 ${before} → ${after}`);
  if (stats.recovered.length > 0) {
    console.log(`[rc] ★ 회복 ${stats.recovered.length}건:`);
    for (const i of stats.recovered) {
      console.log(`   ${i.generated.displayAnswer}  (${i.gen?.sub})`);
    }
  }
  if (stats.newlyRejected.length > 0) {
    console.log(`[rc] ★ 새로 탈락 ${stats.newlyRejected.length}건:`);
    for (const i of stats.newlyRejected) {
      console.log(`   ${i.generated.displayAnswer} — ${i.rejectReasons.join(', ')}`);
    }
  }
  console.log(`[rc] 남은 규칙 탈락 사유: ${JSON.stringify(stats.reasons)}`);
}
