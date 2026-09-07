// =============================================================================
// 세션
//
// 방식 (Q-07 확정)
//   · httpOnly 쿠키에 랜덤 토큰 원본을 담고, DB에는 그 해시만 저장한다
//     ★ DB가 유출되어도 세션을 탈취할 수 없게 한다
//   · 30일 슬라이딩. 단 남은 기간이 15일 미만일 때만 UPDATE 한다 (R003 4-1)
//     ★ 매 요청마다 UPDATE 하면 DB 쓰기가 폭증하고 DB를 계속 깨워 둔다
//   · 만료 세션은 크론이 아니라 로그인 시 기회주의적으로 정리한다
//     ★ 주기적으로 DB를 건드리는 코드를 만들지 않는다 (docs/02-ARCHITECTURE.md 3장)
//
// ★ 세션 레코드는 계정당 여러 개를 허용한다 (다른 기기에서 로그인 유지).
//   제한하는 것은 소켓 연결 1개다 (Q-06). 그것은 socket 계층에서 처리한다.
//   세션을 1개로 제한하면 폰에서 로그인하는 순간 PC가 로그아웃되어 불편하다.
// =============================================================================

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { RULES } from '@quiz/shared';
import { config } from '../config.js';
import { query } from '../db/pool.js';

export const SESSION_COOKIE = 'qw_session';

/**
 * 토큰 해시.
 *
 * ★ 단순 SHA-256이 아니라 SESSION_SECRET을 키로 쓰는 HMAC이다.
 *   토큰이 256비트 랜덤이라 단순 해시로도 역산은 불가능하지만,
 *   DB만 유출되고 SESSION_SECRET은 유출되지 않은 경우에 한 겹 더 막아 준다.
 *   비용이 없으므로 넣는다. (SESSION_SECRET의 실제 용도이기도 하다)
 * ★ 해시 값은 로그에 남기지 않는다.
 */
function hashToken(token: string): string {
  return createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}

export interface SessionInfo {
  sessionId: string;
  accountId: string;
  nickname: string;
}

interface SessionRow {
  id: string;
  account_id: string;
  expires_at: Date;
  nickname: string;
}

/** 새 세션을 만들고 쿠키를 굽는다. */
export async function createSession(
  res: Response,
  accountId: string,
  userAgent: string | undefined,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RULES.SESSION_TTL_MS);

  await query(
    `INSERT INTO sessions (account_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [accountId, hashToken(token), expiresAt, userAgent?.slice(0, 300) ?? null],
  );

  setSessionCookie(res, token, expiresAt);
}

/**
 * 쿠키 속성.
 *
 * ★ Secure 를 환경에 따라 분기한다.
 *   이 프로젝트는 두 방식으로 접속된다.
 *     · 개발:  http://localhost:5173 또는 http://localhost:3000
 *     · 플레이: https://xxxx.trycloudflare.com (터널)
 *   Secure 쿠키는 http 에서 저장되지 않으므로, 개발 중에 Secure 를 붙이면
 *   localhost 에서 로그인이 아예 안 된다.
 *   반대로 터널(https)에서는 Secure 를 붙이는 것이 옳다.
 *   → 요청이 https 로 들어왔는지 보고 결정한다. 고정값을 쓰지 않는다.
 *
 * ★ SameSite=Lax 를 쓴다.
 *   오리진이 하나이므로(서버가 클라이언트를 직접 서빙) None 이 필요 없다.
 *   None 은 서드파티 쿠키로 분류되어 모바일 사파리에서 차단될 수 있다.
 *   Lax 면 초대 링크 클릭(top-level navigation)에도 쿠키가 붙는다.
 */
function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const secure = isHttps(res.req);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires: expiresAt,
    path: '/',
  });
}

function isHttps(req: Request | undefined): boolean {
  if (!req) return false;
  // 터널은 프록시이므로 x-forwarded-proto 를 봐야 한다.
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (proto) return proto.split(',')[0]!.trim() === 'https';
  return req.protocol === 'https';
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
}

/** 쿠키 헤더에서 세션 토큰을 뽑는다. 의존성을 늘리지 않으려고 직접 파싱한다. */
export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

/**
 * 토큰으로 세션을 조회한다. 만료되었으면 null.
 *
 * ★ 슬라이딩 갱신은 남은 기간이 15일 미만일 때만 한다.
 *   사용자 체감은 동일(30일 슬라이딩)하면서 쓰기는 세션당 최대 15일에 한 번이 된다.
 */
export async function resolveSession(token: string | null): Promise<SessionInfo | null> {
  if (!token) return null;

  const result = await query<SessionRow>(
    `SELECT s.id, s.account_id, s.expires_at, a.nickname
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;

  const remaining = row.expires_at.getTime() - Date.now();
  if (remaining < RULES.SESSION_SLIDING_THRESHOLD_MS) {
    const nextExpiry = new Date(Date.now() + RULES.SESSION_TTL_MS);
    await query(`UPDATE sessions SET expires_at = $2, last_seen_at = now() WHERE id = $1`, [
      row.id,
      nextExpiry,
    ]);
  }

  return { sessionId: row.id, accountId: row.account_id, nickname: row.nickname };
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return;
  await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
}

/**
 * 로그인 시 그 계정의 만료 세션을 함께 지운다 (기회주의적 정리).
 * ★ 정리 전용 크론을 두지 않는 이유는 docs/02-ARCHITECTURE.md 3장에 있다.
 */
export async function pruneExpiredSessions(accountId: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE account_id = $1 AND expires_at <= now()`, [accountId]);
}

/** 상수 시간 비교. 문자열 비교로 타이밍 정보가 새는 것을 막는다. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
