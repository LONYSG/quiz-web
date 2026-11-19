// =============================================================================
// ★★ R107 (D-365 · D-366) — HTTP 쪽 방어: 진짜 IP · 보안 헤더 · 로그인/가입 한도 · 비밀번호 계산 줄
//   값은 config.security(환경 변수) · 정본 문서 docs/21-SECURITY.md
// =============================================================================

import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { Gate, GateBusyError, Lockout, WindowCounter, clientIpFrom, type ClientIp } from './limits.js';

const S = config.security;

/** 요청 · 소켓 핸드셰이크 공통 */
export function clientIp(req: IncomingMessage): ClientIp {
  return clientIpFrom(req.socket?.remoteAddress, req.headers);
}

/** IP 기준 한도를 건너뛸까(이 PC 자신 · SEC_LOCAL_EXEMPT=0 이면 건너뛰지 않는다) */
export function exemptIp(c: ClientIp): boolean {
  return S.localExempt && c.local;
}

// -----------------------------------------------------------------------------
// 보안 헤더
// -----------------------------------------------------------------------------
/**
 * ★ CSP — 지금 화면이 쓰는 것만 연다:
 *   스크립트 = 자기 파일만(빌드에 인라인 스크립트 없음) · 스타일 = 인라인 style 속성이 많아 'unsafe-inline'
 *   그림 = 자기 · data:(소리 · 무음) · blob:(사진 올리기 미리보기) · 소리 = Apple 미리듣기(https) · data:(무음 한 토막)
 *   연결 = 자기(소켓 ws/wss 포함) · 끼워 넣기 금지(frame-ancestors 'none') · object 금지
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' https: data: blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function isHttpsReq(req: Request): boolean {
  const f = req.headers['x-forwarded-proto'];
  const p = (Array.isArray(f) ? f[0] : f)?.split(',')[0]?.trim();
  return p ? p === 'https' : req.protocol === 'https';
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY'); // 옛 브라우저용 — CSP frame-ancestors 와 같은 뜻
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // HSTS — https 로 들어왔을 때만(localhost http 개발을 막지 않는다). 하위 도메인 · preload 는 넣지 않는다(되돌리기 어렵다)
  if (isHttpsReq(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}

/** ★ Express 가 오류를 그대로 내보내지 않게(스택 · 내부 경로) — 본문 크기 초과 · JSON 깨짐 등 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const e = err as { status?: number; statusCode?: number; type?: string; message?: string };
  const status = e.status ?? e.statusCode ?? 500;
  if (status >= 500) console.error('[http] ★ 처리 중 오류:', e.message);
  const message =
    e.type === 'entity.too.large' ? '보낸 내용이 너무 큽니다.' : status >= 500 ? '서버에서 문제가 발생했습니다.' : '요청 형식이 올바르지 않습니다.';
  res.status(status >= 400 && status < 600 ? status : 500).json({ ok: false, message });
}

// -----------------------------------------------------------------------------
// 로그인 · 가입 한도 · 비밀번호 계산 줄
// -----------------------------------------------------------------------------
export const loginById = new Lockout(S.loginFailWindowMs, S.loginFailPerId, S.loginLockMs);
export const loginFailByIp = new WindowCounter(S.loginFailWindowMs, S.loginFailPerIp);
export const signupHour = new WindowCounter(60 * 60_000, S.signupPerIpHour);
export const signupDay = new WindowCounter(24 * 60 * 60_000, S.signupPerIpDay);
export const hashGate = new Gate(S.hashConcurrency, S.hashQueue);

export const BUSY_MESSAGE = '지금 사람이 많아요. 잠시 뒤 다시 해 주세요.';

/** 분 단위 안내 */
export function waitText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  return `${min}분`;
}

/** argon2 를 줄 세워 돌린다. 줄이 차면 503 을 보내고 null */
export async function gated<T>(res: Response, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await hashGate.run(fn);
  } catch (err) {
    if (err instanceof GateBusyError) {
      res.status(503).json({ ok: false, message: BUSY_MESSAGE });
      return null;
    }
    throw err;
  }
}
