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
// ★ R078 (D-333) — `--dev` 면 같은 방식으로 **개발 DB quizweb_dev**(npm run db:dev-init · ops 메뉴 17 = --refresh). 알가치 seed 는 검사 DB 만.
// =============================================================================
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_DATABASE_URL, DEV_DB_NAME, LIVE_DB_NAME, TEST_DATABASE_URL, TEST_DB_NAME as TEST_NAME } from './test-db.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = process.env.DB_CONTAINER ?? 'quiz-web-db';
const DB_USER = process.env.DB_USER ?? 'quiz';
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const fromIdx = args.indexOf('--from');
const fromFile = fromIdx >= 0 ? path.resolve(args[fromIdx + 1] ?? '') : null;
const DEV = args.includes('--dev');
const TEST_DB_NAME = DEV ? DEV_DB_NAME : TEST_NAME; // 아래 본문은 옛 이름 그대로 — 대상 DB
const TARGET_URL = DEV ? DEV_DATABASE_URL : TEST_DATABASE_URL;
const TAG = DEV ? 'dev-db' : 'test-db';

function dexec(cmd, opts = {}) {
  const r = spawnSync('docker', ['exec', CONTAINER, ...cmd], { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd.join(' ')} 실패 (exit=${r.status}): ${(r.stderr ?? '').slice(0, 400)}`);
  return (r.stdout ?? '').trim();
}
const sql = (db, q) => dexec(['psql', '-U', DB_USER, '-d', db, '-tAc', q]);

if (fromFile && !existsSync(fromFile)) {
  console.error(`[${TAG}] 백업 파일이 없다: ${fromFile}`);
  process.exit(1);
}

let exists = sql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'`) === '1';
if (exists && refresh) {
  console.log(`[${TAG}] --refresh — ${TEST_DB_NAME} 지움`);
  dexec(['dropdb', '-U', DB_USER, '--if-exists', '--force', TEST_DB_NAME]);
  exists = false;
}

if (!exists) {
  console.log(`[${TAG}] ${TEST_DB_NAME} 만듦 → ${fromFile ? path.relative(ROOT, fromFile) : `${LIVE_DB_NAME}(지금)`} 를 통째 복사`);
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
  console.log(`[${TAG}] 복사 끝 (exit=${code} · ${Math.round((Date.now() - t0) / 1000)}초)`);
} else {
  console.log(`[${TAG}] ${TEST_DB_NAME} 이 이미 있다 — migrate 만(새로 복사하려면 --refresh)`);
}

const mig = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: TARGET_URL },
});
if (mig.status !== 0) {
  console.error(`[${TAG}] migrate 실패`);
  process.exit(1);
}

// ★★ R069 — 검사 DB 에만: 알가치(questions.worth)가 **하나도** 없으면(실 DB 는 G025 전까지 전부 NULL) 등급마다 1 · 2 · 3 · NULL 이
//   고루 섞이게 채운다(id % 4 — 늘 같은 값). 비율 출제 · 가장 어려운 칸(알가치 3) 봇 levelmix 가 이것을 본다. 값이 이미 있으면 건드리지 않는다.
const worthCol = sql(TEST_DB_NAME, `SELECT count(*) FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'worth'`);
if (!DEV && String(worthCol).trim() === '1' && String(sql(TEST_DB_NAME, `SELECT count(worth) FROM questions`)).trim() === '0') {
  sql(TEST_DB_NAME, `UPDATE questions SET worth = CASE id % 4 WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 ELSE NULL END`);
  console.log(`[${TAG}] ★ R069 알가치 seed — ${String(sql(TEST_DB_NAME, `SELECT string_agg(w || ':' || n, ' · ') FROM (SELECT coalesce(worth::text, 'NULL') w, count(*) n FROM questions GROUP BY 1 ORDER BY 1) x`)).trim()}`);
}

const n = (t) => sql(TEST_DB_NAME, `SELECT count(*) FROM ${t}`);
console.log(`[${TAG}] ${TEST_DB_NAME} — questions ${n('questions')} · accounts ${n('accounts')} · minigame_items ${n('minigame_items')} · games ${n('games')}`);
console.log(DEV
  ? `[${TAG}] 개발 서버(npm run dev · ops 메뉴 15 · 3001)가 이 DB 를 쓴다 — 실 DB 로는 개발 서버가 뜨지 않는다(QUIZ_DEV_SERVER)`
  : `[${TAG}] 검사 스크립트(ui-check · bot · smoke)는 이 DB 를 기본으로 쓴다 — 실 DB 로는 서버가 뜨지 않는다(QUIZ_TEST_SERVER)`);
