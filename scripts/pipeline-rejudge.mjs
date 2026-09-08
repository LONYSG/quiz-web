#!/usr/bin/env node
// =============================================================================
// 저장된 배치를 현재 규칙으로 다시 판정한다 (R010)
//
// ★★ API 를 호출하지 않는다. 토큰을 쓰지 않는다.
//   저장된 모델 응답(backcheck.answer / alternatives / confidence)과
//   생성물(answers)만으로 판정을 다시 계산한다.
//   ★ 이것이 "원본과 가공 결과를 함께 보관한다"(R002 2-3)의 실질적 이유다.
//     규칙을 고칠 때마다 다시 가공해야 한다면 규칙을 개선할수록 데이터를 잃는다.
//
// 사용법
//   npm run pipeline:rejudge -- --dry-run   무엇이 바뀔지만 본다
//   npm run pipeline:rejudge                파일을 갱신한다
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIRS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import { rejudge } from '../pipeline/dist/rejudge.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

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
  console.log('[rejudge] processed/ 에 배치가 없다.');
  process.exit(0);
}

let totals = { total: 0, changed: 0, recovered: 0, newlyRejected: 0, needsReview: 0 };
for (const f of files.sort()) {
  const batch = JSON.parse(await readFile(f, 'utf8'));
  const before = (batch.items ?? []).filter((i) => i.verdict === 'accept').length;
  const stats = rejudge(batch.items ?? []);
  const after = (batch.items ?? []).filter((i) => i.verdict === 'accept').length;

  for (const k of Object.keys(totals)) totals[k] += stats[k];

  // 집계를 다시 계산한다
  const items = batch.items ?? [];
  batch._meta.counts = {
    input: batch._meta.counts?.input ?? items.length,
    filtered: items.filter((i) => i.rejectedAt === 'filter').length,
    aiRejected: items.filter((i) => i.rejectedAt === 'ai').length,
    backcheckRejected: items.filter((i) => i.rejectedAt === 'backcheck').length,
    rulesRejected: items.filter((i) => i.rejectedAt === 'rules').length,
    accepted: after,
  };
  batch._meta.rejudgedAt = new Date().toISOString();
  batch._meta.rejudgePromptVersion = PROMPT_VERSION;

  console.log(
    `${path.relative(ROOT, f)}  통과 ${before} → ${after}` +
      `  (회복 ${stats.recovered} / 새 탈락 ${stats.newlyRejected} / 검수 대기 ${stats.needsReview})`,
  );

  if (!DRY) await writeFile(f, JSON.stringify(batch, null, 2) + '\n', 'utf8');
}

console.log('');
console.log(`[rejudge] 대상 ${totals.total}건 / 판정 변경 ${totals.changed}건`);
console.log(`[rejudge] ★ 오탈락 회복 ${totals.recovered}건 / 새로 탈락 ${totals.newlyRejected}건`);
console.log(`[rejudge] 검수 대기로 표시 ${totals.needsReview}건`);
if (DRY) console.log('[rejudge] (--dry-run 이므로 파일을 고치지 않았다)');
