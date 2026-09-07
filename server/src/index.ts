// =============================================================================
// 게임 서버 진입점 (Phase 0)
//
// ★ Phase 0에서 구현하는 것은 다음 네 가지뿐이다.
//   (1) GET /healthz            — DB에 접근하지 않는 생존 확인
//   (2) Socket.IO 연결과 시계 오프셋 측정 (time.ping / time.pong)
//   (3) 클라이언트 빌드 산출물 정적 서빙 (★ 오리진 1개)
//   (4) 부팅 시 정리 절차 (server/src/db/bootCleanup.ts)
//
//   게임 로직(정답 판정, 상태 머신, 마스킹)은 Phase 1 이후다.
//   현재 구현 상태는 docs/05-STATUS.md 를 본다.
// =============================================================================

import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { RULES } from '@quiz/shared';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TimePingPayload,
} from '@quiz/shared';
import { runBootCleanup } from './db/bootCleanup.js';
import { closePool, getDbActiveMs } from './db/pool.js';

// .env 를 읽는다. Node 20.12+ / 22 의 내장 기능이라 dotenv 의존성이 필요 없다.
try {
  process.loadEnvFile?.();
} catch {
  // .env 가 없어도 동작한다. 환경 변수를 직접 주입하는 경우가 있다.
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(HERE, '..', '..', 'client', 'dist');

const PORT = Number(process.env.PORT ?? 3000);
const BOOTED_AT = Date.now();

/**
 * 서버 수신 이벤트에 부여하는 단조 증가 시퀀스 (R003 3-5).
 * guide 18절이 요구하는 "처리 순서를 명확하게 추적"의 근거가 된다.
 * number로 충분하다. Number.MAX_SAFE_INTEGER 까지 안전하므로 이 프로젝트에서 넘칠 일이 없다.
 * ★ 프로세스가 재시작되면 0부터 다시 시작한다. 그래도 되는 이유는
 *   재시작하면 진행 중이던 게임 자체가 사라지고(bootCleanup), 통계와 사후 검증은
 *   answer_events.response_ms 로 하기 때문이다.
 */
let seq = 0;
export const nextSeq = (): number => (seq += 1);

async function main(): Promise<void> {
  // ── 부팅 시 정리 절차. DB에 접근하는 유일한 시작 시점 작업이다.
  try {
    const result = await runBootCleanup();
    if (result.closedRooms > 0 || result.endedGames > 0) {
      console.log(
        `[boot] 이전 실행의 잔여 정리: 방 ${result.closedRooms}개 닫음, 게임 ${result.endedGames}개 종료(server_restart)`,
      );
    } else {
      console.log('[boot] 정리할 잔여 방/게임 없음');
    }
  } catch (err) {
    console.error('[boot] ★ 정리 절차 실패:', (err as Error).message);
    console.error('[boot]   DB가 떠 있는지 확인하세요:  npm run db:up');
    process.exit(1);
  }

  const app = express();

  // ── (1) 헬스체크. ★ DB에 접근하지 않는다. (server/src/db/pool.ts 주석 참조)
  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      phase: 'phase0',
      serverTime: Date.now(),
      bootedAt: BOOTED_AT,
      uptimeMs: Date.now() - BOOTED_AT,
      dbActiveMs: getDbActiveMs(),
    });
  });

  // ── (3) 클라이언트 정적 서빙.
  // ★ 오리진을 하나로 유지하는 것이 이 프로젝트의 기본 방침이다 (R003 1-1).
  //   프론트엔드를 별도 도메인에 두면 쿠키가 cross-origin(SameSite=None, 서드파티)이 되어
  //   모바일 사파리에서 로그인 유지가 깨질 수 있고, CORS 설정도 필요해진다.
  //   따라서 CORS 설정을 두지 않는다. 필요해졌다면 설계가 잘못된 것이다.
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
      if (err) {
        res
          .status(404)
          .type('text/plain; charset=utf-8')
          .send('클라이언트 빌드가 없습니다. 개발 중에는 npm run dev:client 를 쓰거나, npm run build 로 빌드하세요.');
      }
    });
  });

  const httpServer = createServer(app);

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // Q-51 확정. 네트워크가 조용히 끊겼을 때의 감지 시간과 모바일 오탐 사이의 절충이다.
    // 최악의 경우 약 25초 안에 감지된다.
    pingInterval: 15_000,
    pingTimeout: 10_000,
  });

  io.on('connection', (socket) => {
    socket.emit('server.hello', {
      serverTime: Date.now(),
      bootedAt: BOOTED_AT,
      phase: 'phase0',
    });

    // ── (2) 시계 오프셋 측정 (R003 2-4)
    // 서버는 자기 시각만 되돌려준다. 보정 계산은 클라이언트가 한다.
    socket.on('time.ping', (payload: TimePingPayload) => {
      socket.emit('time.pong', { t0: payload?.t0 ?? 0, tServer: Date.now() });
    });

    // ★ heartbeat 는 DB에 접근하지 않는다.
    //   원래 목적(Render 무료 티어의 15분 슬립 방지)은 로컬 PC 서버로 바뀌면서 사라졌다.
    //   그래도 이벤트를 남겨 두는 이유는 R004 5장에 적었다.
    socket.on('heartbeat', () => {
      // 현재는 수신만 한다. Phase 1에서 플레이어 활성 표시에 사용한다.
    });
  });

  httpServer.listen(PORT, () => {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log(`  │  퀴즈 서버 기동  http://localhost:${String(PORT).padEnd(5)}      │`);
    console.log('  └──────────────────────────────────────────────┘');
    console.log(`  Socket.IO  pingInterval=${RULES.TICK_INTERVAL_MS >= 0 ? 15000 : 0}ms pingTimeout=10000ms`);
    console.log('  외부 공개는  npm run dev:tunnel  로 터널을 띄우세요.');
    console.log('');
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[shutdown] ${signal} 수신. 정리합니다.`);
    io.close();
    httpServer.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] 기동 실패:', err);
  process.exit(1);
});
