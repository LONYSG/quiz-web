#!/usr/bin/env node
// =============================================================================
// 문제 원본 수확 (작업 B)
//
// ★ 컴파일 산출물을 실행한다 (docs/07-DECISIONS.md D-020).
//   pipeline/dist 에서 import 한다. 소스를 직접 실행하는 경로를 만들지 않는다.
//
// ★ 이미 수확한 것은 다시 받지 않는다.
//   raw/ 의 모든 파일에서 sourceRef 를 모아 known 집합으로 넘긴다.
//   OpenTDB 는 유한 코퍼스이므로 재수확은 순수한 낭비다.
//
// 사용법
//   npm run pipeline:harvest -- --limit 150
//   npm run pipeline:harvest -- --limit 150 --source opentdb
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harvest } from '../pipeline/dist/adapters/opentdb.js';
import { DATA_DIRS } from '../pipeline/dist/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const LIMIT = Number(opt('--limit', '100'));
const SOURCE = opt('--source', 'opentdb');
const rawDir = path.join(ROOT, DATA_DIRS.raw, SOURCE);

/** raw/ 에 이미 있는 sourceRef 를 전부 모은다 */
async function loadKnown() {
  const known = new Set();
  let files = [];
  try {
    files = await readdir(rawDir);
  } catch {
    return known;
  }
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const text = await readFile(path.join(rawDir, f), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        known.add(JSON.parse(line).sourceRef);
      } catch {
        /* 깨진 줄은 건너뛴다 */
      }
    }
  }
  return known;
}

const known = await loadKnown();
console.log(`[harvest] 이미 갖고 있는 문제: ${known.size}건`);
console.log(`[harvest] 목표: ${LIMIT}건 (소스 ${SOURCE})`);

if (SOURCE !== 'opentdb') {
  console.error(`[harvest] 아직 지원하지 않는 소스: ${SOURCE}`);
  console.error('[harvest]   어댑터를 pipeline/src/adapters/ 에 추가하고 여기에 연결한다.');
  process.exit(1);
}

const started = Date.now();
const result = await harvest({
  limit: LIMIT,
  known,
  log: (m) => console.log(m),
});

if (result.items.length === 0) {
  console.log('[harvest] 새로 받은 문제가 없다.');
  if (result.exhausted) {
    console.log('[harvest] ★ 소스가 소진되었다. 이 소스에서 더 받을 문제가 없다.');
  }
  process.exit(0);
}

// ★ 수확 시점별 파일. append-only. 같은 날 여러 번 돌리면 파일에 이어붙인다.
const day = new Date().toISOString().slice(0, 10);
const file = path.join(rawDir, `${day}.jsonl`);
await mkdir(rawDir, { recursive: true });

let existing = '';
try {
  existing = await readFile(file, 'utf8');
} catch {
  /* 새 파일 */
}
const lines = result.items.map((i) => JSON.stringify(i)).join('\n') + '\n';
await writeFile(file, existing + lines, 'utf8');

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log('');
console.log(`[harvest] 저장: ${path.relative(ROOT, file)}`);
console.log(`[harvest] 새로 받은 문제: ${result.items.length}건`);
console.log(`[harvest] 요청 ${result.requests}회 / ${elapsed}초`);
console.log(`[harvest] 버린 것: boolean ${result.droppedBoolean} / 이미 보유 ${result.droppedKnown}`);
if (result.exhausted) console.log('[harvest] ★ 소스 소진 (더 받을 문제가 없다)');
