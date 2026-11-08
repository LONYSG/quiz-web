// =============================================================================
// ★ 개발 서버 환경 (R078 · D-333) — dev.mjs · ops-run.mjs · ops.mjs 가 같이 쓴다
//
//   `.env` 는 플레이용(PORT 3000 · quizweb) 그대로 두고, 개발 서버(npm run dev)의 **자식 프로세스 env 만** 덮는다:
//     PORT          = DEV_PORT          ?? .env.dev 의 PORT          ?? 3001
//     DATABASE_URL  = DEV_DATABASE_URL  ?? .env.dev 의 DATABASE_URL  ?? (.env 의 DATABASE_URL 에서 DB 이름만 quizweb_dev)
//     QUIZ_DEV_SERVER = 1  → 서버가 실 DB(quizweb)면 부팅 거부(server/src/db/testGuard.ts) · 세션 쿠키 이름 qw_session-dev
//   ★ 셸의 PORT · DATABASE_URL 은 보지 않는다(.env 를 읽은 ops 창에서 띄워도 3000 · quizweb 로 새지 않게).
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { ROOT } from './ops-lib.mjs';

import { DEV_DB_NAME } from './test-db.mjs';
export { DEV_DB_NAME };
export const DEV_PORT_DEFAULT = '3001';
const FALLBACK_URL = `postgresql://quiz:quizlocal@localhost:5434/${DEV_DB_NAME}`;

const readEnvFile = (file) => {
  try { return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}; } catch { return {}; }
};

/** URL 의 DB 이름만 바꾼다(접속 정보는 그대로 · 값은 찍지 않는다) */
export function withDbName(url, name) {
  try {
    const u = new URL(url);
    u.pathname = `/${name}`;
    return u.toString();
  } catch {
    return null;
  }
}

/** 개발 서버 자식 env 에 덮을 값 { PORT, DATABASE_URL, QUIZ_DEV_SERVER, fromEnvDev } — env · 파일은 인자로(테스트) */
export function devOverrides({ env = process.env, dotEnv = readEnvFile(path.join(ROOT, '.env')), envDev = readEnvFile(path.join(ROOT, '.env.dev')) } = {}) {
  const base = dotEnv.DATABASE_URL ?? FALLBACK_URL;
  return {
    PORT: String(env.DEV_PORT ?? envDev.PORT ?? DEV_PORT_DEFAULT),
    DATABASE_URL: env.DEV_DATABASE_URL ?? envDev.DATABASE_URL ?? withDbName(base, DEV_DB_NAME) ?? FALLBACK_URL,
    QUIZ_DEV_SERVER: '1',
    fromEnvDev: Object.keys(envDev).length > 0,
  };
}
