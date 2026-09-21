#!/usr/bin/env node
// =============================================================================
// 격리(discarded)를 되돌린다 — seeds-discard.mjs 의 반대
//
// ★★ R020 에서 필요해졌다. 중복 판정이 "신규가 낫다"(keep=a) 고 본 건을
//   기존 문항과 바꿔 끼우려면, 먼저 격리를 풀어야 적재 대상이 된다.
//
// ★ 왜 지우지 않고 기록을 남기는가 — 무엇을 왜 되돌렸는지가 남아야
//   판정 품질을 뒤에 평가할 수 있다. `restored` 에 이전 격리 사유를 통째로 옮겨 담는다.
//
// ★★ DB 에 쓰지 않는다. 파일만 고친다.
//
// 사용법
//   node scripts/seeds-restore.mjs --round r019 --ref "animals/1#005" \
//     --reason "판정이 신규가 낫다고 보았고 직접 읽어 동의했다" --by "R020 작업 B-3" [--dry-run]
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMid, saveMid, generatedDir } from '../pipeline/lib/seedstore.mjs';
import { resolveSubId, slugOf } from '../pipeline/lib/subid.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};
const DRY = args.includes('--dry-run');
const round = arg('round');
const ref = arg('ref');
const reason = arg('reason');
const by = arg('by') ?? '(미기재)';

if (!round || !ref || !reason) {
  console.error('--round / --ref / --reason 이 필요하다');
  process.exit(1);
}

const subId = ref.split('#')[0];
const r = resolveSubId(subId);

// ── 생성 결과 파일
const genFile = path.join(generatedDir(round), `${slugOf(subId)}.json`);
const doc = JSON.parse(await readFile(genFile, 'utf8'));
const item = doc.items.find((x) => x.seedId === ref);
if (!item) throw new Error(`${ref} 가 ${genFile} 에 없다`);
if (!item.question?.discarded) throw new Error(`${ref} 는 격리 상태가 아니다`);

const was = item.question.discarded;
const restored = { round, reason, decidedBy: by, at: new Date().toISOString(), wasDiscarded: was };

console.log(`[복구] ${ref}`);
console.log(`  이전 격리 사유: ${was.reason}`);
console.log(`  복구 사유:     ${reason}`);
if (DRY) {
  console.log('  (dry-run — 바꾸지 않았다)');
  process.exit(0);
}

delete item.question.discarded;
item.question.restored = restored;
await writeFile(genFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

// ── 소재 저장소
const store = await loadMid(r.midKey);
const seed = store.subs[subId]?.seeds?.find((x) => x.seedId === ref);
if (seed?.question) {
  if (seed.question.discarded) delete seed.question.discarded;
  seed.question.status = 'ok';
  seed.question.restored = restored;
  await saveMid(store);
}
console.log('★ 복구했다. 이제 적재 대상이 된다.');
