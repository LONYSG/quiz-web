#!/usr/bin/env node
// =============================================================================
// 기존 'reject' 를 'quarantine' 으로 재분류한다 (R013 작업 B-1)
//
// ★★ 왜 필요한가
//   R011·R012 배치의 탈락 16건이 verdict='reject' 로 남아 있다.
//   ★ Q-75 확정에 따르면 **Gemini 와 규칙 검사는 버릴 권한이 없다.** 격리만 한다.
//   ★ 즉 지금 'reject' 로 되어 있는 것은 **틀린 상태**다.
//
//   ★ 그리고 그 16건 중 최소 2건이 오탈락으로 확인되었다 (R012 1-4) —
//     "설형문자" 에 "쐐기문자" 가 없어서 / "카를 대제" 에 "카롤루스 대제" 가 없어서.
//   ★ 폐기로 두면 회복 경로가 없다. 격리로 두면 Sonnet 이 되살릴 수 있다.
//
// ★ 원래 판정 근거를 지우지 않는다. quarantine 기록에 옮겨 담는다.
//
// 사용법
//   node scripts/pipeline-migrate-quarantine.mjs --dry-run
//   node scripts/pipeline-migrate-quarantine.mjs
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

const dir = path.join(ROOT, DATA_DIRS.processed);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

let migrated = 0;
const log = [];

for (const f of files) {
  const file = path.join(dir, f);
  const batch = JSON.parse(await readFile(file, 'utf8'));
  let changed = 0;

  for (const item of batch.items ?? []) {
    if (item.verdict !== 'reject') continue;
    // ★ 이미 격리 기록이 있으면 건드리지 않는다
    if (item.quarantine) continue;

    const stage = item.rejectedAt ?? 'unknown';
    // ★ 원래 판정 근거를 모아 상세 사유로 만든다. 정보를 잃지 않는다
    const parts = [];
    if (item.backcheck?.note) parts.push(item.backcheck.note);
    if (item.rules && !item.rules.pass) parts.push(`규칙 검사 실패: ${item.rules.reasons.join(', ')}`);
    if (item.gen?.offCategoryReason) parts.push(`모델 사유: ${item.gen.offCategoryReason}`);
    if (parts.length === 0) parts.push(`사유 코드: ${(item.rejectReasons ?? []).join(', ')}`);

    item.verdict = 'quarantine';
    item.quarantine = {
      stage,
      reasons: item.rejectReasons ?? [],
      detail: parts.join(' / '),
      // ★ 누가 판정했는지 최선으로 복원한다. 모르면 모른다고 적는다
      judgedBy:
        stage === 'rules'
          ? 'rules(코드)'
          : (item.meta?.backcheckModel ?? '확인 불가 (R011/R012 배치)'),
      judgedAt: item.meta?.processedAt ?? '확인 불가',
      confidence: item.backcheck?.confidence,
      alternatives: item.backcheck?.alternatives,
      // ★ 이 기록이 사후에 만들어진 것임을 남긴다
      migratedFrom: 'reject (R013 재분류)',
    };
    item.finalDecision = null;

    const note = `★ 격리 (${stage}): ${item.quarantine.detail}`;
    item.review.note = item.review.note ? `${item.review.note} / ${note}` : note;

    log.push(
      `  [${stage}] ${item.generated?.displayAnswer ?? '(정답 없음)'} — ${(item.rejectReasons ?? []).join(', ')}`,
    );
    changed += 1;
    migrated += 1;
  }

  if (changed > 0) {
    if (!DRY) {
      batch._meta.quarantineMigratedAt = new Date().toISOString();
      await writeFile(file, JSON.stringify(batch, null, 2) + '\n', 'utf8');
    }
    console.log(`[mq] ${f}: ${changed}건`);
  }
}

console.log('');
for (const l of log) console.log(l);
console.log('');
console.log(`[mq] ★ 재분류 ${migrated}건${DRY ? ' (dry-run — 저장하지 않았다)' : ''}`);
console.log('[mq] ★ verdict 가 reject → quarantine 이 되었다. **버린 것이 아니라 확정 대기다.**');
console.log('[mq] ★ 원래 판정 근거는 quarantine.detail 에 옮겨 담았다. 정보를 잃지 않았다.');
