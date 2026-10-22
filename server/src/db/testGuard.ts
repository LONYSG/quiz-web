// =============================================================================
// ★★★ 검사 서버 빗장 (R060 · D-253)
//
// ★ 왜 — 2026-10-21 밤 검사 스크립트가 띄운 서버가 실제 DB(quizweb)로 부팅해
//   부팅 정리(bootCleanup)가 사람이 하던 방 · 판 11개를 닫았다.
//   검사 스크립트(scripts/test-db.mjs)는 서버를 띄울 때 QUIZ_TEST_SERVER=1 을 준다.
//   그 값이 있는데 DB 가 실 DB 면 **부팅 정리 전에** 멈춘다. 사람이 쓰는 npm run dev · start 는 그대로.
// =============================================================================

export const LIVE_DB_NAME = 'quizweb';

export function dbNameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

export function isTestServer(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QUIZ_TEST_SERVER === '1';
}

/** 거부 사유(없으면 null) — 검사 서버인데 실 DB 를 가리키거나 DB 이름을 읽지 못하면 거부 */
export function testServerRefusal(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isTestServer(env)) return null;
  const name = dbNameOf(env.DATABASE_URL);
  if (name === LIVE_DB_NAME) return `검사 서버(QUIZ_TEST_SERVER=1)가 실 DB(${LIVE_DB_NAME})로 뜨려 한다 — 부팅 거부(검사는 quizweb_test · npm run db:test-init)`;
  if (name === '') return '검사 서버(QUIZ_TEST_SERVER=1)인데 DATABASE_URL 의 DB 이름을 읽지 못했다 — 부팅 거부';
  return null;
}
