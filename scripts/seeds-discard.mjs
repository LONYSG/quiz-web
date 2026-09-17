#!/usr/bin/env node
// =============================================================================
// 생성된 문제 하나를 **격리(폐기 표시)** 한다
//
// ★★ 파일에서 지우지 않는다. `discarded` 표시만 붙인다.
//   ★ 근거: 왜 버렸는지가 남아야 판정 품질을 뒤에 평가할 수 있다 (R011 이래의 원칙).
//     그리고 소재 자체는 usedSeeds 에 남겨 **같은 소재를 다시 만들지 않게** 한다.
//
// ★ 격리된 문제는 적재 대상에서 빠진다 (pipeline-load 가 discarded 를 건너뛴다).
//
// ★★ DB 에 쓰지 않는다.
//
// 사용법
//   node scripts/seeds-discard.mjs --round r017 --ref "kr-history/4#006" \
//     --reason "중복 (db:196)" --by "건우 (Q-87 확정)" [--duplicate-of db:196] [--dry-run]
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMid, saveMid, generatedDir } from '../pipeline/lib/seedstore.mjs';
import { resolveSubId, slugOf } from '../pipeline/lib/subid.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const DRY = args.includes('--dry-run');

const round = arg('round');
const ref = arg('ref');
const reason = arg('reason');
const by = arg('by') ?? '(미기재)';
const duplicateOf = arg('duplicate-of');

if (!round || !ref || !reason) {
  console.error('--round / --ref / --reason 이 필요하다');
  process.exit(1);
}

const subId = ref.split('#')[0];
const r = resolveSubId(subId);
const genFile = path.join(generatedDir(round), `${slugOf(subId)}.json`);
const doc = JSON.parse(await readFile(genFile, 'utf8'));
const item = doc.items.find((x) => x.seedId === ref);
if (!item) throw new Error(`${ref} 를 찾을 수 없다`);
if (item.question.discarded) {
  console.log(`이미 격리되어 있다: ${ref} — ${item.question.discarded.reason}`);
  process.exit(0);
}

const record = { round: 'r018', reason, decidedBy: by, duplicateOf, at: new Date().toISOString() };

console.log(`격리 대상  ${ref}  (${r.path})`);
console.log(`  질문   ${item.question.question}`);
console.log(`  정답   ${item.question.answer}`);
console.log(`  사유   ${reason}  /  판단 ${by}`);

if (DRY) {
  console.log('\n[dry-run] 바꾸지 않았다');
  process.exit(0);
}

item.question.discarded = record;
await writeFile(genFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

const midDoc = await loadMid(r.midKey);
const seed = midDoc.subs[subId]?.seeds.find((s) => s.seedId === ref);
if (!seed) throw new Error(`소재 저장소에 ${ref} 가 없다`);
seed.question.status = 'discarded';
seed.question.discarded = record;

// ★ usedAnswers 에서 **지우지 않는다.** 표시만 남긴다.
//   ★ 근거: 이 소분류에서 그 소재를 이미 썼다는 사실은 그대로다.
//     지우면 다음 라운드에 같은 소재를 다시 만들게 된다.
const ua = midDoc.subs[subId].usedAnswers.find((a) => a.origin === `${round}:${ref}`);
if (ua) ua.note = `${ua.note ? `${ua.note} / ` : ''}r018 격리: ${reason}`;

await saveMid(midDoc);
console.log('\n★ 격리했다. 파일에서 지우지 않았고 usedSeeds 에도 그대로 남겼다.');
