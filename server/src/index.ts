// =============================================================================
// 게임 서버 진입점
//
// Phase 1 범위: 계정 / 세션 / 방 / 방장 / 메모리 방 관리 구조 / 전역 tick
// Phase 2 범위: 로비 설정 / 경험률 / 카운트다운 / 게임 시작
// 문제 출제와 정답 판정은 Phase 3 이후다.
// 현재 구현 상태는 docs/05-STATUS.md 를 본다.
// =============================================================================

import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { CLIENT_DIST, config } from './config.js';
import { runBootCleanup } from './db/bootCleanup.js';
import { closePool, getDbActiveMs } from './db/pool.js';
import { authRouter } from './http/authRoutes.js';
import { registerSocketHandlers } from './socket/index.js';
import { startTick, stopTick } from './tick.js';
import { activeCount, getRoom, roomCount } from './rooms/registry.js';

const BOOTED_AT = Date.now();

async function main(): Promise<void> {
  // ── 부팅 시 정리 절차.
  //   ★ 이것이 없으면 프로세스가 죽은 뒤 그 사람이 다시는 방을 만들 수 없다.
  //     로컬 PC 서버는 껐다 켜는 것이 일상이라 반드시, 자주 발생한다.
  //     docs/02-ARCHITECTURE.md 2장 참조.
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
  app.use(express.json({ limit: '32kb' }));

  // ── 헬스체크. ★ DB에 접근하지 않는다 (docs/02-ARCHITECTURE.md 3장)
  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      phase: 'phase5',
      serverTime: Date.now(),
      bootedAt: BOOTED_AT,
      uptimeMs: Date.now() - BOOTED_AT,
      dbActiveMs: getDbActiveMs(),
      rooms: roomCount(),
    });
  });

  /**
   * ★★ 방 상태 진단 (읽기 전용. **개발 환경에서만**).
   *
   * ★ 왜 필요한가 (R015) — Phase 5 테스트의 핵심이
   *   **"전원이 나간 뒤 서버가 어떤 상태인가"** 다.
   *   ★★ 소켓으로 보려면 누군가 붙어 있어야 하는데, 붙는 순간 활성 인원이 바뀌어
   *     PAUSED 조건 자체가 무너진다. ★ 관측이 대상을 바꾼다.
   *   → ★ 붙지 않고 읽을 수 있는 경로를 둔다.
   *
   * ★★ 프로덕션에서는 열지 않는다.
   *   ★ 근거: 방 상태에는 진행 중인 문제의 index·epoch 가 들어 있다.
   *     ★ 정답은 담지 않지만, 운영 환경에서 내부 상태를 공개할 이유가 없다.
   */
  if (!config.isProduction) {
    app.get('/debug/room/:id', (req, res) => {
      const room = getRoom(req.params.id);
      if (!room) {
        res.status(404).json({ exists: false });
        return;
      }
      res.json({
        exists: true,
        state: room.state,
        activeCount: activeCount(room),
        players: room.players.size,
        hostAccountId: room.hostAccountId,
        // ★ 정답을 담지 않는다. index 와 epoch 만이다
        question: room.currentQuestion
          ? {
              index: room.currentQuestion.index,
              epoch: room.currentQuestion.epoch,
              endsAt: room.currentQuestion.endsAt,
              resolved: room.currentQuestion.resolved,
              hintPushed: room.currentQuestion.hintPushed,
            }
          : null,
        paused: room.paused,
        gameId: room.game?.gameId ?? null,
        questionIndex: room.game?.questionIndex ?? 0,
      });
    });
    console.log('[boot] ★ 개발 진단 경로 열림: GET /debug/room/:id (프로덕션에서는 닫힌다)');
  }

  app.use('/api/auth', authRouter);

  // ── 클라이언트 정적 서빙.
  //   ★ 오리진을 하나로 유지하는 것이 이 프로젝트의 기본 방침이다 (docs/02-ARCHITECTURE.md 1장).
  //     프론트엔드를 별도 도메인에 두면 쿠키가 cross-origin(SameSite=None, 서드파티)이 되어
  //     모바일 사파리에서 로그인 유지가 깨질 수 있고 CORS 설정도 필요해진다.
  //     따라서 CORS 설정을 두지 않는다. 필요해졌다면 설계가 잘못된 것이다.
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
      if (err) {
        res
          .status(404)
          .type('text/plain; charset=utf-8')
          .send(
            '클라이언트 빌드가 없습니다. 개발 중에는 npm run dev:client 를 쓰거나, npm run build 로 빌드하세요.',
          );
      }
    });
  });

  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    // Q-51 확정. 네트워크가 조용히 끊겼을 때 최악 약 25초 안에 감지된다.
    // 기본값(25/20초, 최악 45초)보다 빠르고, 너무 짧게 잡았을 때의 모바일 오탐도 피한다.
    pingInterval: 15_000,
    pingTimeout: 10_000,
  });

  registerSocketHandlers(io);

  // ── 전역 tick.
  //   ★ 방마다 타이머를 두지 않는다. Phase 3~5의 게임 타이머가 전부 여기 들어온다.
  startTick();

  httpServer.listen(config.port, () => {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log(`  │  퀴즈 서버 기동  http://localhost:${String(config.port).padEnd(5)}      │`);
    console.log('  └──────────────────────────────────────────────┘');
    console.log('  Phase 2 (로비 설정 / 경험률 / 카운트다운).  문제 출제는 Phase 3 이후.');
    console.log('  Socket.IO  pingInterval=15000ms pingTimeout=10000ms');
    console.log('  외부 공개는  npm run dev:tunnel  로 터널을 띄우세요.');
    console.log('');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[shutdown] ${signal} 수신. 정리합니다.`);
    stopTick();
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
