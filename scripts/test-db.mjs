// =============================================================================
// ★★★ 검사 DB (R060 · D-253) — 검사 스크립트(ui-check · ui-check-bundles · bot · smoke)가 함께 쓴다
//
// ★ 왜 — 2026-10-21 밤 검사 서버가 실제 DB(quizweb)로 부팅해 부팅 정리(bootCleanup)가
//   사람이 하던 방 · 판 11개를 닫았다. 검사는 quizweb_test 만 쓴다.
//
//   useTestDb(tag)  ← 검사 스크립트 맨 위에서 한 번
//     · DATABASE_URL 기본값을 quizweb_test 로(밖에서 준 값이 있으면 그 값)
//     · QUIZ_TEST_SERVER=1 — 띄우는 서버가 실 DB 면 부팅을 거부한다(server/src/db/testGuard.ts)
//     · 실 DB(quizweb)를 가리키면 · 검사 DB 가 없으면 멈춘다("먼저 npm run db:test-init")
//   assertTestServer(base, tag)  ← 이미 떠 있는 서버를 쓰기 전에 — 검사 서버가 아니면 멈춘다
//
// 만들기 · 새로 고치기: npm run db:test-init [-- --refresh] (scripts/db-test-init.mjs · DB-ADMIN "검사 DB")
// =============================================================================
import pg from 'pg';

export const LIVE_DB_NAME = 'quizweb';
export const TEST_DB_NAME = 'quizweb_test';
export const TEST_DATABASE_URL = `postgresql://quiz:quizlocal@localhost:5434/${TEST_DB_NAME}`;

export function dbNameOf(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

export async function useTestDb(tag) {
  process.env.DATABASE_URL ??= TEST_DATABASE_URL;
  process.env.QUIZ_TEST_SERVER = '1';
  const name = dbNameOf(process.env.DATABASE_URL);
  if (name === LIVE_DB_NAME) {
    console.error(`[${tag}] ★★ DATABASE_URL 이 실 DB(${LIVE_DB_NAME})다 — 검사는 ${TEST_DB_NAME} 로만 돈다(D-253). DATABASE_URL 을 빼고 다시.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    if (err.code === '3D000') {
      console.error(`[${tag}] ★ 검사 DB(${name})가 없다 — 먼저 npm run db:test-init`);
      process.exit(1);
    }
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
  return process.env.DATABASE_URL;
}

/** 이미 떠 있는 서버 — /healthz 의 testServer 가 true 가 아니면(실 서버 · 옛 빌드) 쓰지 않는다 */
export async function assertTestServer(base, tag) {
  let body = null;
  try {
    const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) });
    body = await r.json();
  } catch {
    /* 응답 없음 — 부르는 쪽이 이미 확인했다 */
  }
  if (body?.testServer === true) return;
  throw new Error(`[${tag}] ★★ ${base} 에 떠 있는 서버는 검사 서버가 아니다(실 서버일 수 있다) — 그 서버로 검사하지 않는다. 다른 포트로(--url · PORT) 다시.`);
}
