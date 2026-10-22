// =============================================================================
// ★ 포인트 운영 스크립트 공통 (R059 · D-254) — feedback-adopt · points-grant
//   실 DB(quizweb)가 기본 · DATABASE_URL 로 바꾼다. 검사 DB(quizweb_test)일 때만 --allow-bot 을 받는다(봇 시나리오용).
// =============================================================================
import { TEST_DB_NAME, dbNameOf } from './test-db.mjs';

/** 봇 · 검사 계정 (shared NEAR_MISS_SKIP_LOGIN 과 같은 꼴) */
export const BOT_LOGIN = /^(bot|uic|r10_)/i;
export const isBotLogin = (login) => BOT_LOGIN.test(login ?? '');

export function adminDb() {
  const url = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
  return { url, isTest: dbNameOf(url) === TEST_DB_NAME };
}

export function die(msg) {
  console.error(`[points] ✘ ${msg}`);
  process.exit(1);
}

export const short = (s, n) => ([...(s ?? '')].length > n ? `${[...s].slice(0, n).join('')}…` : (s ?? ''));
