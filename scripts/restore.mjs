#!/usr/bin/env node
// =============================================================================
// DB 복원
//
// 사용법
//   npm run db:restore -- backups/quizweb-20260907-120000.dump
//
// ★ 주의: 기존 데이터를 덮어쓴다. --clean 으로 기존 객체를 지우고 복원하므로
//   복원 전 현재 상태를 백업해 두는 것을 권한다.
//   npm run db:backup && npm run db:restore -- <파일>
//
// 자세한 절차는 docs/11-DEPLOY.md 참조.
// =============================================================================

import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const CONTAINER = process.env.DB_CONTAINER ?? 'quiz-web-db';
const DB_USER = process.env.DB_USER ?? 'quiz';
const DB_NAME = process.env.DB_NAME ?? 'quizweb';

const file = process.argv[2];
if (!file) {
  console.error('사용법: npm run db:restore -- <백업파일>');
  console.error('예:     npm run db:restore -- backups/quizweb-20260907-120000.dump');
  process.exit(1);
}

const abs = path.resolve(file);
if (!existsSync(abs)) {
  console.error(`파일이 없습니다: ${abs}`);
  process.exit(1);
}

console.log(`[restore] ${abs} → ${CONTAINER}`);
console.log('[restore] ★ 기존 데이터를 덮어씁니다.');

const child = spawn(
  'docker',
  ['exec', '-i', CONTAINER, 'pg_restore', '-U', DB_USER, '-d', DB_NAME, '--clean', '--if-exists', '--no-owner'],
  { stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' },
);

createReadStream(abs).pipe(child.stdin);

child.on('exit', (code) => {
  // pg_restore 는 무해한 경고에도 0이 아닌 코드를 낼 수 있다.
  if (code === 0) console.log('[restore] 완료');
  else console.warn(`[restore] exit=${code}. 위 메시지를 확인하세요(경고만이면 정상일 수 있습니다).`);
});
