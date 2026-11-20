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
import { CLIENT_DIST, TWEMOJI_DIR, config } from './config.js';
import { runBootCleanup } from './db/bootCleanup.js';
import { closePool, getDbActiveMs } from './db/pool.js';
import { devServerRefusal, isDevServer, isTestServer, testServerRefusal } from './db/testGuard.js';
import { emojiRouter, loadEmojiCatalog } from './http/emojiRoutes.js';
import { avatarRouter } from './http/avatarRoutes.js';
import { meRouter, profileRouter } from './http/meRoutes.js';
import { feedbackRouter } from './http/feedbackRoutes.js';
import { reportRouter } from './http/reportRoutes.js';
import { minigameRouter } from './http/minigameRoutes.js';
import { shopRouter } from './http/shopRoutes.js';
import { authRouter } from './http/authRoutes.js';
import { registerSocketHandlers } from './socket/index.js';
import { clientIp, errorHandler, securityHeaders } from './security/http.js';
import { applySocketSecurity, socketServerOptions } from './security/socket.js';
import { startTick, stopTick } from './tick.js';
import { SITE_TEXT, type Site } from '@quiz/shared';
import { readSessionToken, resolveSession } from './auth/session.js';
import { loadQuizData } from './db/minigameItems.js';
import { ensureSharedPool } from './db/questionPool.js';
import { getHeapStatistics } from 'node:v8';
import { friendGate, hiddenFor, publicClosed, publicCounts, publicUrl, siteOf, siteSplit } from './site.js';
import { closedPageHtml } from './closedPage.js';

// ★ R111 — 닫힌 공개 자리에서도 내는 파일(로고 그림만)
const CLOSED_OPEN_FILES = new Set(['/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png']);
import { activeCount, getRoom, roomCount } from './rooms/registry.js';

const BOOTED_AT = Date.now();

async function main(): Promise<void> {
  // ── 부팅 시 정리 절차.
  //   ★ 이것이 없으면 프로세스가 죽은 뒤 그 사람이 다시는 방을 만들 수 없다.
  //     로컬 PC 서버는 껐다 켜는 것이 일상이라 반드시, 자주 발생한다.
  //     docs/02-ARCHITECTURE.md 2장 참조.
  // ★★★ R060 (D-253) — 검사 서버가 실 DB 로 뜨면 부팅 정리 전에 멈춘다
  const refusal = testServerRefusal() ?? devServerRefusal(); // ★ R078 — 개발 서버도 실 DB 면 거부
  if (refusal) {
    console.error(`[boot] ★★ ${refusal}`);
    process.exit(1);
  }

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
  // ★★ R107 (D-366) — 보안 헤더(모든 응답) · Express 이름 숨김
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '32kb' }));

  // ── 헬스체크. ★ DB에 접근하지 않는다 (docs/02-ARCHITECTURE.md 3장)
  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      phase: 'phase5',
      serverTime: Date.now(),
      bootedAt: BOOTED_AT,
      pid: process.pid, // ★ R070 — play.mjs · 메뉴 4 가 "어느 프로세스가 답하는가" 를 찍는다
      uptimeMs: Date.now() - BOOTED_AT,
      dbActiveMs: getDbActiveMs(),
      rooms: roomCount(),
      // ★ R060 — 검사 스크립트가 "이미 떠 있는 서버" 를 쓰기 전에 본다(실 서버면 쓰지 않는다)
      testServer: isTestServer(),
      devServer: isDevServer(), // ★ R078 — ops 메뉴 4 가 3001 을 본다
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
      // ★★ R107 (D-366) — 실 서버도 .env 가 NODE_ENV=development 라 이 경로가 터널 밖에 열려 있었다 → 이 PC 자신(루프백 · CF 헤더 없음)만
      if (!clientIp(req).local) {
        res.status(404).json({ ok: false });
        return;
      }
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
              // ★ R028 — 일반 힌트는 보냈는지 여부만. 문장은 넣지 않는다
              generalHintPushed: room.currentQuestion.generalHintPushed,
            }
          : null,
        paused: room.paused,
        gameId: room.game?.gameId ?? null,
        questionIndex: room.game?.questionIndex ?? 0,
      });
    });
    console.log('[boot] ★ 개발 진단 경로 열림: GET /debug/room/:id (프로덕션에서는 닫힌다)');
  }

  // ★★★ R109 (D-369) — 자리(공개 · 베타). 판별은 siteOf 한 함수 · 베타 자리(자리를 가를 때)는 검색 엔진 금지 · 지인 계정만
  app.use((req, res, next) => {
    const site = siteOf(req);
    res.locals.site = site;
    if (friendGate(site)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  // ★★ R111 (D-371) — 닫힌 공개 자리: 화면 주소 전부 = 준비 중 한 장 · /api 는 /api/site 만(/healthz 는 위에서 이미 답함) · 그 밖 403
  //   열린 파일은 로고 그림(파비콘 · 아이콘)뿐 — 앱 묶음(/assets) · 소리 · 이모티콘 · 그림 길은 닫힌 동안 내지 않는다
  app.use((req, res, next) => {
    if (!publicClosed(res.locals.site as Site)) {
      next();
      return;
    }
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.path === '/api/site') {
      next();
      return;
    }
    if (CLOSED_OPEN_FILES.has(req.path) && (req.method === 'GET' || req.method === 'HEAD')) {
      next();
      return;
    }
    if (req.path.startsWith('/api/') || req.path === '/api' || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(403).json({ ok: false, error: 'closed' });
      return;
    }
    if (/^\/(assets|sounds|emoji|socket\.io)\//.test(req.path) || /\.[a-z0-9]{2,5}$/i.test(req.path)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(403).type('text/plain; charset=utf-8').send('closed');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).type('text/html; charset=utf-8').send(closedPageHtml());
  });
  app.use('/api', async (req, res, next) => {
    // 로그인 · 가입 · 나가기 · 자리 정보는 각자 검사한다(로그인 화면이 써야 한다)
    if (!friendGate(res.locals.site as Site) || req.path.startsWith('/auth/') || req.path === '/site') {
      next();
      return;
    }
    try {
      const session = await resolveSession(readSessionToken(req.headers.cookie));
      if (session && !session.isFriend) {
        res.status(403).json({ ok: false, code: 'FRIEND_ONLY', message: SITE_TEXT.friendOnlyLogin });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  });
  // ★ R109 — 부트 정보: 자리 · 숨기는 방식/미니게임(화면이 목록에서 뺀다 — 서버도 다시 막는다) · 로그인 없이
  app.get('/api/site', (_req, res) => {
    const site = res.locals.site as Site;
    res.setHeader('Cache-Control', 'no-store');
    // ★ R111 — open: 닫힌 공개 자리만 false(베타 · 열린 공개 · 자리 안 가름 = true)
    res.json({ ok: true, site, split: siteSplit(), open: !publicClosed(site), hidden: hiddenFor(site), publicUrl: site === 'friend' ? publicUrl() : null });
  });

  app.use('/api/auth', authRouter);
  // ★ R039 — 프로필 사진
  app.use('/api/avatar', avatarRouter);
  // ★ R048 — 포인트 (D-229)
  app.use('/api/me', meRouter);
  // ★ R056 — 다른 사람 업적 (D-248) · 문제 평가 (D-246)
  app.use('/api/profile', profileRouter);
  app.use('/api/feedback', feedbackRouter);
  // ★ R061 — 앱 제보(🐞 · 📝) → app_reports
  app.use('/api/reports', reportRouter);
  // ★ R049 — 포인트샵 · 뽑기 (D-231)
  app.use('/api/shop', shopRouter);
  // ★ R052 — 퀴즈류 미니게임 그림 (DB bytea · 로그인만)
  app.use('/api/minigame', minigameRouter);
  // ★ R039 — 이모티콘 목록 · 직접 등록 그림 / 표준 그림(Twemoji SVG)은 파일로 낸다
  app.use('/api/emoji', emojiRouter);
  app.use('/emoji', express.static(TWEMOJI_DIR, { maxAge: '365d', immutable: true }));
  void loadEmojiCatalog();
  // ★★ R110 — 문항 풀 한 벌을 미리 읽는다(첫 판이 기다리지 않게 · 로그 "[pool] 문항 풀 한 벌 n개 · 약 m MB") · 실패해도 첫 판 시작 때 다시 읽는다
  void ensureSharedPool()
    .then(() => console.log(`[pool] 힙 상한 ${Math.round(getHeapStatistics().heap_size_limit / 1048576)}MB${process.env.SERVER_HEAP_MB ? ` (SERVER_HEAP_MB=${process.env.SERVER_HEAP_MB})` : ' (Node 기본값)'}`))
    .catch((err) => console.warn('[pool] ★ 문항 풀을 미리 못 읽었다(첫 판 시작 때 다시):', (err as Error).message));
  // ★ R109 — 공개 쪽 숨김(남는 항목 수)을 처음 한 번 센다(그 뒤는 적재본을 읽을 때마다)
  if (siteSplit()) {
    void loadQuizData()
      .then(() => console.log(`[site] 자리 나눔 켜짐 · 공개 ${config.publicHostname ?? '-'} · 베타 ${config.friendHostname ?? '-'}${config.siteForce ? ` · 강제 ${config.siteForce}` : ''} · 공개 남는 항목 ${JSON.stringify(publicCounts)} · 공개 숨김 ${JSON.stringify(hiddenFor('public'))}`))
      .catch((err) => console.warn('[site] ★ 미니게임 항목을 못 읽었다(공개 숨김은 노래만):', (err as Error).message));
  }

  // ── 클라이언트 정적 서빙.
  //   ★ 오리진을 하나로 유지하는 것이 이 프로젝트의 기본 방침이다 (docs/02-ARCHITECTURE.md 1장).
  //     프론트엔드를 별도 도메인에 두면 쿠키가 cross-origin(SameSite=None, 서드파티)이 되어
  //     모바일 사파리에서 로그인 유지가 깨질 수 있고 CORS 설정도 필요해진다.
  //     따라서 CORS 설정을 두지 않는다. 필요해졌다면 설계가 잘못된 것이다.
  // ★ R107 (D-366) — 캐시: 이름에 해시가 붙은 빌드 파일(/assets/)은 1년(바뀌면 이름이 바뀐다) · html 은 늘 새로 · 나머지(소리)는 1시간.
  //   Cloudflare 는 원 서버가 max-age=0 을 보내면 캐시하지 않는다(옛 기본값) — 이제 공격 · 사람이 몰려도 큰 파일은 Cloudflare 가 낸다
  app.use(
    express.static(CLIENT_DIST, {
      setHeaders: (res, filePath) => {
        const p = filePath.replace(/\\/g, '/');
        if (p.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }),
  );
  app.get('*', (_req, res) => {
    // ★ R107 — 화면 주소(/room/… 등)도 index.html 이다: 새 판이 바로 보이게 캐시하지 않는다
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }, (err) => {
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
  // ★ R107 (D-366) — 마지막 오류 처리(스택 · 내부 경로를 응답에 내지 않는다)
  app.use(errorHandler);

  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    // ★★ R107 (D-365) — 메시지 크기 · 연결 시간 · Origin 검사
    ...socketServerOptions,
    // Q-51 확정. 네트워크가 조용히 끊겼을 때 최악 약 25초 안에 감지된다.
    // 기본값(25/20초, 최악 45초)보다 빠르고, 너무 짧게 잡았을 때의 모바일 오탐도 피한다.
    pingInterval: 15_000,
    pingTimeout: 10_000,
  });

  // ★ R107 — 연결 수 · 이벤트 속도(세션 미들웨어 · 핸들러보다 먼저)
  applySocketSecurity(io);
  registerSocketHandlers(io);

  // ── 전역 tick.
  //   ★ 방마다 타이머를 두지 않는다. Phase 3~5의 게임 타이머가 전부 여기 들어온다.
  startTick();

  // ★★ R107 (D-364) — 기본 127.0.0.1(이 PC 안에서만). 터널 cloudflared 는 루프백으로 붙는다 · HOST 로 바꾼다
  httpServer.listen(config.port, config.host, () => {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log(`  │  퀴즈 서버 기동  http://localhost:${String(config.port).padEnd(5)}      │`);
    console.log(`  듣는 주소 ${config.host}:${config.port}${config.host === '127.0.0.1' ? ' (이 PC 안에서만 — 밖은 터널로)' : ''}`);
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
