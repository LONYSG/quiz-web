#!/usr/bin/env node
// =============================================================================
// ★★★ 검사 DB 만들기 (R060 · D-253)
//
//   npm run db:test-init                         없으면 만들고 지금 quizweb 를 통째 복사 → migrate · 있으면 migrate 만
//   npm run db:test-init -- --refresh            지우고 다시 복사
//   npm run db:test-init -- --refresh --from backups/quizweb-….dump   복사 원본을 백업 파일로
//
// ★ 같은 컨테이너(quiz-web-db · 5434)의 quizweb_test. 문항 · 미니게임 · 이모티콘 · 계정이 다 필요해 통째 복사한다.
// ★ quizweb 에는 읽기(pg_dump)만 한다. 도구는 컨테이너 안의 것(backup.mjs 와 같은 이유 — 버전).
// =============================================================================
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_DB_NAME, TEST_DATABASE_URL, TEST_DB_NAME } from './test-db.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = process.env.DB_CONTAINER ?? 'quiz-web-db';
const DB_USER = process.env.DB_USER ?? 'quiz';
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const fromIdx = args.indexOf('--from');
const fromFile = fromIdx >= 0 ? path.resolve(args[fromIdx + 1] ?? '') : null;

function dexec(cmd, opts = {}) {
  const r = spawnSync('docker', ['exec', CONTAINER, ...cmd], { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd.join(' ')} 실패 (exit=${r.status}): ${(r.stderr ?? '').slice(0, 400)}`);
  return (r.stdout ?? '').trim();
}
const sql = (db, q) => dexec(['psql', '-U', DB_USER, '-d', db, '-tAc', q]);

if (fromFile && !existsSync(fromFile)) {
  console.error(`[test-db] 백업 파일이 없다: ${fromFile}`);
  process.exit(1);
}

let exists = sql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'`) === '1';
if (exists && refresh) {
  console.log(`[test-db] --refresh — ${TEST_DB_NAME} 지움`);
  dexec(['dropdb', '-U', DB_USER, '--if-exists', '--force', TEST_DB_NAME]);
  exists = false;
}

if (!exists) {
  console.log(`[test-db] ${TEST_DB_NAME} 만듦 → ${fromFile ? path.relative(ROOT, fromFile) : `${LIVE_DB_NAME}(지금)`} 를 통째 복사`);
  dexec(['createdb', '-U', DB_USER, TEST_DB_NAME]);
  const t0 = Date.now();
  // pg_restore 는 소유자 · 권한 경고로 exit 1 을 줄 수 있다 — 결과는 아래 표 수로 본다
  const code = await new Promise((resolve) => {
    let p;
    if (fromFile) {
      p = spawn('docker', ['exec', '-i', CONTAINER, 'pg_restore', '-U', DB_USER, '-d', TEST_DB_NAME, '--no-owner', '--no-privileges'], { stdio: ['pipe', 'inherit', 'inherit'] });
      createReadStream(fromFile).pipe(p.stdin);
    } else {
      p = spawn('docker', ['exec', CONTAINER, 'sh', '-c', `pg_dump -U ${DB_USER} -Fc ${LIVE_DB_NAME} | pg_restore -U ${DB_USER} -d ${TEST_DB_NAME} --no-owner --no-privileges`], { stdio: ['ignore', 'inherit', 'inherit'] });
    }
    p.on('close', resolve);
  });
  console.log(`[test-db] 복사 끝 (exit=${code} · ${Math.round((Date.now() - t0) / 1000)}초)`);
} else {
  console.log(`[test-db] ${TEST_DB_NAME} 이 이미 있다 — migrate 만(새로 복사하려면 --refresh)`);
}

const mig = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
});
if (mig.status !== 0) {
  console.error('[test-db] migrate 실패');
  process.exit(1);
}

const n = (t) => sql(TEST_DB_NAME, `SELECT count(*) FROM ${t}`);
console.log(`[test-db] ${TEST_DB_NAME} — questions ${n('questions')} · accounts ${n('accounts')} · minigame_items ${n('minigame_items')} · games ${n('games')}`);
console.log(`[test-db] 검사 스크립트(ui-check · bot · smoke)는 이 DB 를 기본으로 쓴다 — 실 DB 로는 서버가 뜨지 않는다(QUIZ_TEST_SERVER)`);
