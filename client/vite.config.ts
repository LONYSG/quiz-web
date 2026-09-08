import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

// 개발 중에는 Vite가 5173, 서버가 3000이다.
// ★ 프록시로 /socket.io 와 /healthz 를 서버로 넘겨 "오리진이 하나"인 상태를 개발 중에도 유지한다.
//   이렇게 하면 개발 환경과 배포 환경의 동작이 달라지지 않는다.

// =============================================================================
// ★★ 프록시 오류 로그 정리 (R008 / docs/07-DECISIONS.md D-030)
//
// 증상: 클라이언트 창에 아래가 반복된다.
//   [vite] ws proxy error: Error: read ECONNRESET
//   [vite] ws proxy socket error: Error: read ECONNRESET
//
// ★ 원인을 실측으로 가렸다. 세 상황을 각각 재현했다.
//
//   ┌──────────────────────────────────┬───────────────────────────┐
//   │ 상황                              │ 프록시 로그                 │
//   ├──────────────────────────────────┼───────────────────────────┤
//   │ socket.io 연결을 FIN 없이 끊기      │ 없음                       │
//   │ ★ 실제 브라우저(Chrome)에서 탭 닫기 │ ★ 없음                     │
//   │ ★ 서버 프로세스가 죽기             │ ★ ECONNRESET, 이어서        │
//   │                                  │   ECONNREFUSED 가 계속 반복  │
//   └──────────────────────────────────┴───────────────────────────┘
//
// ★★ 즉 이 로그는 "탭을 닫아서 나는 정상 로그" 가 아니다.
//   **서버가 사라졌다는 사실을 정확히 알려주고 있었다.**
//
// ★ 그래서 ECONNRESET 을 침묵시키지 않는다.
//   침묵시키면 "서버를 안 켰다 / 서버가 죽었다" 를 알 수 없게 되어 훨씬 나쁘다.
//
// ★ 대신 신호는 남기고 소음만 줄인다.
//   (1) 스택 대신 한 줄로, 무엇을 해야 하는지까지 적는다
//   (2) 같은 코드가 반복되면 THROTTLE_MS 동안 모아 한 번만 알리고 생략 횟수를 적는다
//       socket.io 가 재연결을 시도하는 동안 ECONNREFUSED 가 초당 여러 번 발생하기 때문이다
//
// ★ 구현 주의: proxy.on('error') 를 달아도 Vite 자신의 로그는 그대로 나온다.
//   Vite 가 프록시 오류를 **자기 logger 로 직접** 찍기 때문이다.
//   (처음에 그렇게 만들었더니 로그가 오히려 늘었다. 실측으로 확인했다)
//   → customLogger 로 그 한 종류만 걸러 우리 형식으로 바꾼다.
//   ★ 다른 로그는 손대지 않는다. 기동 안내와 HMR 로그는 그대로 나와야 한다.
// =============================================================================

const THROTTLE_MS = 5000;

const HINTS: Record<string, string> = {
  ECONNREFUSED:
    '게임 서버(:3000)에 연결할 수 없습니다. 다른 터미널에서 npm run dev 가 떠 있는지 확인하세요.',
  ECONNRESET: '게임 서버와의 연결이 끊겼습니다. 서버가 재시작되었거나 종료되었습니다.',
  EPIPE: '게임 서버와의 연결이 이미 닫혀 있습니다.',
};

type ProxyErr = Error & { code?: string };

const lastReported = new Map<string, { at: number; suppressed: number }>();

function reportProxyError(err: ProxyErr): void {
  const code = err.code ?? 'UNKNOWN';
  const now = Date.now();
  const prev = lastReported.get(code);

  if (prev && now - prev.at < THROTTLE_MS) {
    prev.suppressed += 1;
    return;
  }

  const repeated = prev?.suppressed ? ` (직전 ${prev.suppressed}건 생략)` : '';
  lastReported.set(code, { at: now, suppressed: 0 });
  console.error(`[proxy] ${code}${repeated} — ${HINTS[code] ?? err.message}`);
}

/**
 * Vite 자신의 프록시 오류 로그를 우리 형식으로 바꾼다.
 * ★ 'proxy error' 계열 한 종류만 가로챈다. 나머지 error 로그는 그대로 통과시킨다.
 */
const logger = createLogger();
const originalError = logger.error.bind(logger);
logger.error = (msg, opts) => {
  if (typeof msg === 'string' && /proxy (socket )?error/i.test(msg)) {
    const code = /\b(ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ECONNABORTED)\b/.exec(msg)?.[1];
    reportProxyError({ name: 'ProxyError', message: msg.split('\n')[0] ?? msg, code });
    return;
  }
  originalError(msg, opts);
};

function handleProxyErrors(proxy: {
  on: (
    event: 'error',
    handler: (
      err: ProxyErr,
      req: IncomingMessage | ClientRequest,
      res?: ServerResponse | Socket,
    ) => void,
  ) => void;
}): void {
  proxy.on('error', (_err, _req, res) => {
    // ★ 여기서는 로그를 찍지 않는다. customLogger 가 이미 한 번 찍는다.
    //   양쪽에서 찍으면 소음이 두 배가 된다.
    //   매달린 소켓을 남기지 않는 것만 담당한다.
    if (res && 'destroy' in res && typeof res.destroy === 'function') res.destroy();
  });
}

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        configure: handleProxyErrors,
      },
      '/api': { target: 'http://localhost:3000', configure: handleProxyErrors },
      '/healthz': { target: 'http://localhost:3000', configure: handleProxyErrors },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
