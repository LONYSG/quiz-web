// =============================================================================
// ★★ R107 (D-365) — 소켓 쪽 방어
//   · Origin 검사(허용 = PUBLIC_HOSTNAME · localhost/127.0.0.1 · *.trycloudflare.com · Origin 없음(브라우저가 아닌 것 — 쿠키가 없으면 어차피 로그인 안 됨))
//   · 동시 연결: IP 당 · 계정당 · 로그인 안 된 소켓은 10초 안에 끊는다
//   · 소켓당 이벤트 속도(모든 이벤트 합 — 통 하나) · 넘으면 그 소켓만 끊는다
//   · 방 만들기: 계정마다 n개/창
//   값은 config.security · 정본 문서 docs/21-SECURITY.md
// =============================================================================

import type { IncomingMessage } from 'node:http';
import type { Server, Socket } from 'socket.io';
import { config } from '../config.js';
import { clientIp, exemptIp } from './http.js';
import { Counter, TokenBucket, WindowCounter, type ClientIp } from './limits.js';

const S = config.security;

/** 허용하는 Origin 인가 */
export function originAllowed(origin: string | undefined, publicHostname: string | null = config.publicHostname): boolean {
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return true;
  if (/^[a-z0-9-]+\.trycloudflare\.com$/.test(host)) return true;
  if (publicHostname && (host === publicHostname || host === `www.${publicHostname}`)) return true;
  return false;
}

/** socket.io 서버 옵션 — 메시지 크기 · 연결 시간 · Origin */
export const socketServerOptions = {
  maxHttpBufferSize: S.socketMaxBytes,
  // 핸드셰이크만 하고 이름공간에 안 붙는 연결을 이 시간 뒤 닫는다(기본 45초)
  connectTimeout: 10_000,
  allowRequest: (req: IncomingMessage, cb: (err: string | null | undefined, ok: boolean) => void) => {
    const ok = originAllowed(req.headers.origin);
    if (!ok) console.warn(`[sec] 소켓 Origin 거부 ${String(req.headers.origin).slice(0, 80)}`);
    cb(ok ? null : 'origin', ok);
  },
};

const perIp = new Counter();
const perAccount = new Counter();
const roomCreates = new WindowCounter(S.roomCreateWindowMs, S.roomCreatePerAccount);

/** 잰 값(봇 attack · 보고) */
export const secStats = { ipRefused: 0, accountRefused: 0, anonClosed: 0, floodClosed: 0, originRefused: 0 };

interface SecData {
  sec?: { ip: ClientIp; accountCounted?: string };
  session?: { accountId: string };
}

/**
 * ★ io 에 붙인다 — registerSocketHandlers 보다 **먼저** 불러야 한다(미들웨어 · connection 순서).
 */
export function applySocketSecurity(io: Server): void {
  // ── 엔진 단계: IP 당 동시 연결(이름공간에 붙기 전 · 핸드셰이크만 하는 연결도 센다)
  io.engine.on('connection', (raw: { request: IncomingMessage; close: () => void; once: (e: string, f: () => void) => void }) => {
    const ip = clientIp(raw.request);
    if (exemptIp(ip)) return;
    const n = perIp.inc(ip.ip);
    raw.once('close', () => perIp.dec(ip.ip));
    if (n > S.socketPerIp) {
      secStats.ipRefused += 1;
      if (secStats.ipRefused % 50 === 1) console.warn(`[sec] 소켓 IP 한도 ${ip.ip} (${n})`);
      raw.close();
    }
  });
  io.engine.on('connection_error', (err: { message?: string; code?: number }) => {
    if (err.message === 'origin' || err.code === 4) secStats.originRefused += 1;
  });

  // ── 이름공간 단계: IP 기록 · 계정당 동시 연결(세션은 다음 미들웨어가 채운다 — 여기는 IP 만)
  io.use((socket, next) => {
    (socket.data as SecData).sec = { ip: clientIp(socket.request) };
    next();
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SecData;
    // 계정당 동시 연결
    const accountId = data.session?.accountId;
    if (accountId) {
      const n = perAccount.inc(accountId);
      data.sec = { ...(data.sec ?? { ip: clientIp(socket.request) }), accountCounted: accountId };
      socket.once('disconnect', () => perAccount.dec(accountId));
      if (n > S.socketPerAccount) {
        secStats.accountRefused += 1;
        console.warn(`[sec] 소켓 계정 한도 #${accountId} (${n})`);
        socket.disconnect(true);
        return;
      }
    } else {
      // 로그인 안 된 소켓 — 시각 동기화 · hello 뿐이다. 화면은 로그인한 뒤에만 소켓을 연다(App.tsx)
      const t = setTimeout(() => {
        if (socket.connected) {
          secStats.anonClosed += 1;
          socket.disconnect(true);
        }
      }, S.anonSocketMs);
      socket.once('disconnect', () => clearTimeout(t));
    }
    // 소켓당 이벤트 속도(모든 이벤트 합)
    const bucket = new TokenBucket(S.socketEventsPerSec, S.socketEventBurst);
    let closed = false;
    socket.use((_packet, next) => {
      if (closed) return;
      if (bucket.take()) {
        next();
        return;
      }
      closed = true;
      secStats.floodClosed += 1;
      console.warn(`[sec] 소켓 이벤트 폭주로 끊음 ${accountId ? `#${accountId}` : '(로그인 안 됨)'} · ${data.sec?.ip.ip ?? '?'}`);
      socket.disconnect(true);
    });
  });
}

/** 방 만들기 한도 — 넘었으면 남은 ms, 아니면 0(세었다) */
export function roomCreateLimited(socket: Socket, accountId: string): number {
  const ip = (socket.data as SecData).sec?.ip;
  if (ip && exemptIp(ip)) return 0;
  if (roomCreates.hit(accountId)) return 0;
  return Math.max(1, roomCreates.retryMs(accountId));
}
