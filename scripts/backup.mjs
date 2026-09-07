#!/usr/bin/env node
// =============================================================================
// DB 백업
//
// ★ 왜 중요한가
//   이 프로젝트의 DB는 건우 PC의 로컬 PostgreSQL이다(R004 0장). 클라우드 백업이 없다.
//   즉 이 스크립트가 유일한 안전장치다.
//   특히 question_experiences 는 guide 26절이 "장기 보존"을 요구하는 자산이고
//   한 번 잃으면 복구할 방법이 없다.
//   "디스크가 날아갈 일이 없다"고 해도, 개발 중 실수로 db:reset 을 돌리거나
//   컨테이너 볼륨을 지우는 일은 흔하다.
//
// 사용법
//   npm run db:backup                 backups/quizweb-YYYYMMDD-HHmmss.dump 생성
//   npm run db:backup -- --out 경로   위치 지정
//
// 복원은 scripts/restore.mjs 를 쓴다. 절차는 docs/11-DEPLOY.md 참조.
// =============================================================================

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* .env 가 없어도 기본값으로 동작한다 */
}

const CONTAINER = process.env.DB_CONTAINER ?? 'quiz-web-db';
const DB_USER = process.env.DB_USER ?? 'quiz';
const DB_NAME = process.env.DB_NAME ?? 'quizweb';

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const outIdx = process.argv.indexOf('--out');
const outFile =
  outIdx >= 0 && process.argv[outIdx + 1]
    ? path.resolve(process.argv[outIdx + 1])
    : path.join(ROOT, 'backups', `quizweb-${stamp()}.dump`);

await mkdir(path.dirname(outFile), { recursive: true });

// ★ pg_dump 를 컨테이너 안에서 실행한다.
//   호스트의 psql/pg_dump 버전(13)이 서버 버전(17)보다 낮아 버전 불일치로 실패할 수 있다.
//   컨테이너 안의 도구는 항상 서버와 같은 버전이다.
console.log(`[backup] ${CONTAINER} → ${outFile}`);

const child = spawn(
  'docker',
  ['exec', CONTAINER, 'pg_dump', '-U', DB_USER, '-d', DB_NAME, '-Fc'],
  { stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' },
);

const { createWriteStream } = await import('node:fs');
const out = createWriteStream(outFile);
child.stdout.pipe(out);

child.on('exit', (code) => {
  if (code === 0) {
    console.log('[backup] 완료');
    console.log('[backup] 복원:  npm run db:restore -- ' + path.relative(ROOT, outFile));
  } else {
    console.error(`[backup] 실패 (exit=${code}). 컨테이너가 떠 있는지 확인하세요: npm run db:up`);
    process.exit(1);
  }
});
