// =============================================================================
// Socket.IO 핸들러
//
// Phase 1 범위: 방 생성 / 입장 / 퇴장 / 채팅 / 방장 강제 퇴장 / 시각 동기화
// Phase 2 범위: 게임 설정 / 경험률 / 게임 시작 / 카운트다운
// ★ Phase 3 범위 (R014): 정답 판정 / 스킵 투표 / 강제 스킵 / 강제 종료 / 다시 하기
//
// ★★★ chat.send 핸들러는 **동기여야 한다.** 그 안에 await 를 넣지 말 것.
//   ★ 근거는 game/answer.ts 헤더에 있다. 요약하면 —
//     await 한 줄이 두 명을 동시에 정답자로 만들 수 있고, 에러도 나지 않고,
//     동시 입력이 정확히 겹치는 순간에만 발생하며 재현이 매우 어렵다.
//
// ★ 모든 인바운드 이벤트는 socket/guard.ts 의 on / onRoom 을 통해 등록한다.
//   그러면 seq 부여와 세션·방·권한·상태·스키마 검사를 빼먹을 수 없다.
// =============================================================================

import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { RULES, validateRoomSettings } from '@quiz/shared';
import { closeRoom, findRoom, insertRoom } from '../db/rooms.js';
import { insertMidgamePlayer } from '../db/gameQuestions.js';
import { loadExperienced } from '../db/questionPool.js';
import { cancelCountdown, notEnoughMessage, requestStart } from '../game/start.js';
import { checkChatRate, judgeAnswer } from '../game/answer.js';
import {
  abortQuestionSync,
  broadcastExperiencedUpdated,
  broadcastPlayers,
  broadcastSkipVotes,
  evaluateSkip,
  finishGame,
  recordAnswerEvent,
  resolveQuestionSync,
} from '../game/question.js';
import { refreshLobbyInfo } from '../lobby/info.js';
import { closeOpenGame } from '../rooms/lifecycle.js';
import { readSessionToken, resolveSession } from '../auth/session.js';
import {
  bindIo,
  disconnectSocket,
  emitRoom,
  emitToSocket,
  ioRoomName,
} from '../rooms/emit.js';
import {
  activeCount,
  addPlayer,
  createRoomObject,
  generateRoomId,
  getRoom,
  getRoomOfAccount,
  markDisconnected,
  pushChat,
  registerRoom,
  removePlayer,
  unregisterRoom,
} from '../rooms/registry.js';
import { buildSnapshot, toPlayerView } from '../rooms/snapshot.js';
import { currentSeq, nextSeq } from '../seq.js';
import {
  on,
  onRoom,
  parseObject,
  parseString,
  sendError,
  type SocketData,
} from './guard.js';

const BOOTED_AT = Date.now();

/**
 * 계정별 현재 소켓. Q-06(계정당 활성 연결 1개)을 강제한다.
 * ★ 세션 레코드는 여러 개 허용하고 소켓 연결만 1개로 제한한다 (R003 4-1).
 */
const socketByAccount = new Map<string, string>();

export function registerSocketHandlers(io: Server): void {
  bindIo(io);

  // ── 핸드셰이크에서 세션을 확인한다.
  //   ★ 소켓 이벤트로 로그인하지 않는다. 이미 구워진 쿠키를 읽기만 한다.
  io.use(async (socket, next) => {
    try {
      const token = readSessionToken(socket.handshake.headers.cookie);
      const session = await resolveSession(token);
      if (session) {
        (socket.data as SocketData).session = {
          accountId: session.accountId,
          nickname: session.nickname,
          sessionId: session.sessionId,
        };
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;

    socket.emit('server.hello', {
      serverTime: Date.now(),
      bootedAt: BOOTED_AT,
      phase: 'phase3',
    });

    if (!data.session) {
      // 로그인하지 않은 연결도 허용한다. 시각 동기화와 hello 만 받는다.
      // 방 관련 이벤트는 guard 가 UNAUTHENTICATED 로 막는다.
      registerCommonHandlers(socket);
      registerRoomHandlers(socket);
      return;
    }

    const accountId = data.session.accountId;

    // ── Q-06: 같은 계정의 기존 연결을 끊고 승계한다
    const previousSocketId = socketByAccount.get(accountId);
    if (previousSocketId && previousSocketId !== socket.id) {
      emitToSocket(previousSocketId, 'session.terminated', { reason: 'another_connection' });
      disconnectSocket(previousSocketId);
    }
    socketByAccount.set(accountId, socket.id);

    socket.emit('session.established', {
      accountId,
      nickname: data.session.nickname,
      serverTime: Date.now(),
    });

    registerCommonHandlers(socket);
    registerRoomHandlers(socket);

    // ── 재접속: 이미 방에 소속되어 있으면 자동으로 다시 붙인다
    const existingRoom = getRoomOfAccount(accountId);
    if (existingRoom) {
      attachToRoom(socket, existingRoom.id, 'reconnect');
    }

    socket.on('disconnect', () => {
      // ★ 승계된 소켓의 disconnect 가 새 소켓의 매핑을 지우지 않게 한다
      if (socketByAccount.get(accountId) === socket.id) {
        socketByAccount.delete(accountId);
      }
      const room = getRoomOfAccount(accountId);
      if (!room) return;
      // 현재 소켓이 그 플레이어의 소켓일 때만 끊김으로 처리한다
      const player = room.players.get(accountId);
      if (!player || player.socketId !== socket.id) return;

      markDisconnected(room, accountId);
      // ★ 스킵 분모와 활성 인원은 끊김 즉시 반영한다 (Q-29).
      //   반면 점수판의 "접속 종료" 표시는 5초 유예 뒤에 나타난다 (Q-15 보완).
      //   그래서 여기서는 activeCount 만 즉시 알리고, 표시 갱신은 tick 이 담당한다.
      emitRoom(room, 'room.connectionChanged', {
        accountId,
        connected: false,
        activeCount: activeCount(room),
      });
      // ★★ 인원이 줄면 스킵 임계값이 내려간다. **이 블록 안에서 동기적으로** 재평가한다
      //   (04-PROTOCOL 4장). ★ 다음 tick 으로 미루면 그 사이 도착한 정답과 순서가
      //   불명확해진다. 이미 도달했으면 그 자리에서 스킵된다.
      evaluateSkip(room);
      broadcastSkipVotes(room);
    });
  });
}

// -----------------------------------------------------------------------------
function registerCommonHandlers(socket: Socket): void {
  // 시각 동기화. 로그인 없이도 동작한다 (R003 2-4)
  socket.on('time.ping', (payload: { t0?: number } | undefined) => {
    socket.emit('time.pong', { t0: payload?.t0 ?? 0, tServer: Date.now() });
  });

  // ★ heartbeat 는 DB를 건드리지 않는다 (docs/02-ARCHITECTURE.md 3장).
  //   현재 목적은 애플리케이션 레벨 생존 확인이며, 클라우드 전환 시 슬립 방지에 다시 쓰인다.
  socket.on('heartbeat', () => {
    /* 수신만 한다 */
  });
}

// -----------------------------------------------------------------------------
function registerRoomHandlers(socket: Socket): void {
  // ── 방 생성
  on<{ title: string }>(
    socket,
    'room.create',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const title = parseString(
          obj.title,
          RULES.ROOM_TITLE_MIN_LENGTH,
          RULES.ROOM_TITLE_MAX_LENGTH,
        );
        return title === null ? null : { title };
      },
    },
    async ({ socket: s, session, payload }) => {
      // 이미 어느 방에 있으면 거절한다. 한 사람이 두 방에 동시에 있을 수 없다.
      if (getRoomOfAccount(session.accountId)) {
        sendError(s, 'ALREADY_HAS_ROOM', '이미 방에 참가한 상태입니다.');
        return;
      }

      const roomId = generateRoomId();
      const inserted = await insertRoom(roomId, payload.title, session.accountId);
      if (!inserted.ok) {
        // ★ 부팅 정리 절차가 없으면 여기서 영구히 막힌다.
        //   docs/02-ARCHITECTURE.md 2장 참조.
        sendError(s, 'ALREADY_HAS_ROOM');
        return;
      }

      const room = createRoomObject(roomId, payload.title, session.accountId);
      registerRoom(room);
      console.log(`[room] 생성 ${roomId} by ${session.accountId} "${payload.title}"`);

      s.emit('room.created', { roomId });
      attachToRoom(s, roomId, 'join');
    },
  );

  // ── 방 입장
  on<{ roomId: string }>(
    socket,
    'room.join',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const roomId = parseString(obj.roomId, 1, 64);
        return roomId === null ? null : { roomId };
      },
    },
    async ({ socket: s, session, payload }) => {
      const already = getRoomOfAccount(session.accountId);
      if (already && already.id !== payload.roomId) {
        sendError(s, 'ALREADY_HAS_ROOM', '다른 방에 참가한 상태입니다.');
        return;
      }

      const room = getRoom(payload.roomId);
      if (!room) {
        // ★ guide 49절: "존재하지 않는 방" 과 "이미 종료된 방" 을 구분해 안내한다.
        //   메모리에 없으면 DB를 보고 closed_at 으로 판별한다.
        const row = await findRoom(payload.roomId);
        sendError(s, row ? 'ROOM_CLOSED' : 'ROOM_NOT_FOUND');
        return;
      }
      attachToRoom(s, room.id, already ? 'reconnect' : 'join');
    },
  );

  // ── 방 나가기
  //   ★ 명시적 나가기와 예기치 못한 끊김을 구분하지 않는다 (Q-15).
  //     단 Phase 1에는 게임이 없으므로 나가기는 슬롯을 즉시 반환한다.
  //     Phase 3 이후에는 게임 중이면 슬롯을 유지해야 한다.
  onRoom(socket, 'room.leave', {}, ({ socket: s, session, room }) => {
    leaveRoom(s, room.id, session.accountId);
  });

  // ── 상태 재동기화 (R003 2-4: 백그라운드 복귀 시)
  onRoom(socket, 'state.resync', {}, ({ socket: s, session, room }) => {
    s.emit('room.state', buildSnapshot(room, session.accountId, 'resync', currentSeq()));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ★★★ 채팅 = 답안 (guide 12절). Phase 3 의 심장이다
  //
  //   순서를 고정한다 (04-PROTOCOL 5장). ★ 이 순서를 바꾸지 말 것.
  //     단계 1  검증 (동기)                — 길이 / rate limit
  //     단계 2  ★ 판정 (동기, await 금지)  — 마스킹을 전혀 알지 못한다
  //     단계 3  브로드캐스트 (동기)         — chat.message 가 먼저 나간다
  //     단계 4  상태 전환 + DB (여기서부터 비동기 허용)
  //
  //   ★ 단계 2 가 단계 3 보다 먼저인 이유: 판정 결과가 확정되어야 "정답!" 을 보낼 수 있다.
  //   ★ 단계 3 이 단계 4(question.resolved emit)보다 먼저인 이유: 화면에
  //     "철수: 훈민정음" 다음에 "정답! 철수" 가 떠야 한다.
  //   ★ 전환과 전송을 분리해도 원자성은 resolved 플래그가 보장한다.
  // ─────────────────────────────────────────────────────────────────────────
  onRoom<{ text: string; epoch: number | null }>(
    socket,
    'chat.send',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const text = parseString(obj.text, 1, RULES.CHAT_MAX_LENGTH);
        if (text === null) return null;
        // ★ epoch 는 숫자가 아니면 null 로 본다.
        //   ★ 조용히 0 으로 만들지 않는다 — 0 은 실제 epoch 값일 수 있다.
        //   ★ null 이면 판정에서 제외된다 (epoch_mismatch). 옛 클라이언트가 여기 걸린다.
        const epoch = typeof obj.epoch === 'number' && Number.isFinite(obj.epoch)
          ? obj.epoch
          : null;
        return { text, epoch };
      },
    },
    ({ seq, socket: s, room, player, payload }) => {
      const now = Date.now();

      // ── 단계 1. 검증
      //   ★ rate limit 초과는 **본인에게만** 조용히 알린다 (Q-18).
      //     ★ 방 전체에 알리면 도배 자체가 알림이 된다.
      const retryAfterMs = checkChatRate(room, player.accountId, now, {
        windowMs: RULES.CHAT_RATE_WINDOW_MS,
        max: RULES.CHAT_RATE_MAX,
      });
      if (retryAfterMs !== null) {
        s.emit('chat.throttled', { retryAfterMs });
        return;
      }

      const rawNfc = payload.text.normalize('NFC');

      // ── 단계 2. ★★ 판정. **동기다. 여기에 await 가 없다.**
      //   ★ 입력은 클라이언트가 보낸 원문이다. 마스킹을 전혀 알지 못한다.
      const outcome = judgeAnswer(room, player, {
        rawText: rawNfc,
        epoch: payload.epoch,
        receivedAt: now,
      });

      // ── 단계 3. 브로드캐스트.
      //   ★ 마스킹은 Phase 6 이다. 지금은 전원 동일 페이로드다.
      const entry = {
        id: randomUUID(),
        seq,
        accountId: player.accountId,
        nickname: player.nickname,
        colorIndex: player.colorIndex,
        rawNfc,
        maskedText: null,
        ts: now,
        system: false,
      };
      pushChat(room, entry);
      emitRoom(room, 'chat.message', {
        id: entry.id,
        seq: entry.seq,
        accountId: entry.accountId,
        nickname: entry.nickname,
        colorIndex: entry.colorIndex,
        text: entry.rawNfc,
        masked: false,
        ts: entry.ts,
        system: false,
      });

      // ── 단계 4. 상태 전환과 DB
      //   ★ 정답 문자열과 일치한 메시지만 answer_events 에 남긴다 (Q-52).
      if (outcome.matched && outcome.question) {
        recordAnswerEvent(room, player, {
          seq,
          receivedAt: now,
          accepted: outcome.accepted,
          wasEligible: outcome.wasEligible,
          rejectReason: outcome.rejectReason,
          questionIndex: outcome.question.index,
          questionId: outcome.question.questionId,
          startedAt: outcome.question.startedAt,
        });
      }
      if (outcome.accepted) {
        // ★★ 여기까지 오는 사이에 await 가 없었다. 그래서 두 번째 정답이 끼어들 수 없다.
        //   ★ 그리고 resolveQuestionSync 의 첫 두 줄(장치 A)이 한 번 더 막는다.
        if (resolveQuestionSync(room, 'correct', player.accountId)) {
          broadcastPlayers(room);
        }
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 2 — 로비 설정 / 게임 시작
  // ───────────────────────────────────────────────────────────────────────────

  // ── 게임 설정 변경 (guide 7절)
  //   ★ 방장만 바꿀 수 있고, LOBBY 에서만 바꿀 수 있다.
  //     클라이언트가 읽기 전용으로 그려도 서버가 다시 검사한다 (guide 44절).
  onRoom<Record<string, unknown>>(
    socket,
    'lobby.updateSettings',
    {
      requireHost: true,
      // ★ 상태 검사를 guard 에 맡긴다. COUNTDOWN 이후에는 여기서 걸린다.
      allowedStates: ['LOBBY'],
      parse: (raw) => parseObject(raw),
    },
    ({ socket: s, room, payload }) => {
      // ★ settingsLocked 는 상태와 별개 축이다. 둘 다 본다.
      //   (COUNTDOWN 에서 취소 없이 LOBBY 로 돌아가는 경로가 Phase 4에 생긴다)
      if (room.settingsLocked) {
        sendError(s, 'INVALID_STATE', '게임이 시작되어 설정을 바꿀 수 없습니다.');
        return;
      }

      // ★ 검증은 shared 의 순수 함수 하나로만 한다. 클라이언트와 같은 함수다.
      const valid = validateRoomSettings(payload);
      if (!valid.ok) {
        sendError(s, 'BAD_REQUEST', valid.message);
        return;
      }

      room.settings = { ...valid.settings };

      // ★ 출제 가능 수는 설정값과 무관하다(참가자 집합에만 의존한다).
      //   그래서 여기서 DB를 다시 조회하지 않고 캐시된 값을 함께 보낸다.
      //   숫자를 한 글자 고칠 때마다 쿼리가 나가지 않게 하기 위함이다.
      emitRoom(room, 'lobby.settingsUpdated', {
        settings: { ...room.settings },
        settingsLocked: room.settingsLocked,
        availableQuestionCount: room.availableQuestionCount,
      });
    },
  );

  // ── 게임 시작 (T01 / T02)
  onRoom(
    socket,
    'game.start',
    { requireHost: true, allowedStates: ['LOBBY'] },
    async ({ socket: s, room }) => {
      const result = await requestStart(room);
      if (result.ok) return;
      switch (result.reason) {
        case 'not_enough':
          sendError(
            s,
            'NOT_ENOUGH_QUESTIONS',
            notEnoughMessage(result.available, result.wanted),
          );
          return;
        case 'settings':
          sendError(s, 'BAD_REQUEST', result.message);
          return;
        case 'no_active':
          sendError(s, 'INVALID_STATE', '접속 중인 참가자가 없습니다.');
          return;
        case 'busy':
          sendError(s, 'INVALID_STATE', '이미 시작 처리 중입니다.');
          return;
        default:
          sendError(s, 'INVALID_STATE', `현재 상태: ${room.state}`);
      }
    },
  );

  // ── 카운트다운 취소 (T03, Q-11)
  onRoom(
    socket,
    'game.cancelCountdown',
    { requireHost: true, allowedStates: ['COUNTDOWN'] },
    ({ socket: s, room }) => {
      if (!cancelCountdown(room)) sendError(s, 'INVALID_STATE', `현재 상태: ${room.state}`);
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 3 — 스킵 / 강제 스킵 / 강제 종료 / 다시 하기
  // ───────────────────────────────────────────────────────────────────────────

  // ── 스킵 투표 (guide 22절)
  //   ★ 모든 플레이어가 쓸 수 있다. 투표와 취소가 가능하다.
  //   ★ epoch 를 담는다. 문제가 바뀐 뒤 도착한 투표를 다음 문제에 반영하지 않는다.
  onRoom<{ vote: boolean; epoch: number | null }>(
    socket,
    'skip.vote',
    {
      allowedStates: ['QUESTION_ACTIVE'],
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        if (typeof obj.vote !== 'boolean') return null;
        const epoch =
          typeof obj.epoch === 'number' && Number.isFinite(obj.epoch) ? obj.epoch : null;
        return { vote: obj.vote, epoch };
      },
    },
    ({ socket: s, room, player, payload }) => {
      const q = room.currentQuestion;
      if (!q || q.resolved) {
        sendError(s, 'INVALID_STATE', '이미 끝난 문제입니다.');
        return;
      }
      // ★ epoch 가 다르면 무시한다. 낡은 화면에서 누른 투표다
      if (payload.epoch !== q.epoch) {
        sendError(s, 'INVALID_STATE', '문제가 이미 바뀌었습니다.');
        return;
      }
      // ★ 접속 중인 사람만 투표할 수 있다. 분모가 활성 인원이므로 분자도 같아야 한다
      if (!player.connected) return;

      if (payload.vote) q.skipVotes.add(player.accountId);
      else q.skipVotes.delete(player.accountId);

      // ★★ 임계 도달 여부를 **이 블록 안에서 동기적으로** 판정한다 (04-PROTOCOL 4장).
      //   ★ 다음 tick 으로 미루면 그 사이 도착한 정답과 순서가 불명확해진다.
      broadcastSkipVotes(room);
      evaluateSkip(room);
    },
  );

  // ── 방장 강제 스킵 (guide 23절 / T09)
  //   ★ epoch 를 담는다. 방장이 확인창을 띄운 사이 문제가 끝났다면 무시해야 한다.
  //     ★ 그러지 않으면 다음 문제를 스킵해 버린다 (04-PROTOCOL 4장).
  onRoom<{ epoch: number | null }>(
    socket,
    'host.forceSkip',
    {
      requireHost: true,
      allowedStates: ['QUESTION_ACTIVE'],
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const epoch =
          typeof obj.epoch === 'number' && Number.isFinite(obj.epoch) ? obj.epoch : null;
        return { epoch };
      },
    },
    ({ socket: s, room, payload }) => {
      const q = room.currentQuestion;
      if (!q || q.resolved) {
        sendError(s, 'INVALID_STATE', '이미 끝난 문제입니다.');
        return;
      }
      if (payload.epoch !== q.epoch) {
        // ★★ 이것이 "다음 문제를 스킵해 버리는 사고" 를 막는 자리다
        sendError(s, 'INVALID_STATE', '문제가 이미 바뀌었습니다. 다시 눌러 주세요.');
        return;
      }
      resolveQuestionSync(room, 'host_skip', null);
    },
  );

  // ── 방장 강제 종료 (guide 25절 / T11 / T12)
  //   ★★ epoch 를 담지 않는다. 게임 전체 액션이므로 특정 문제에 종속되지 않는다
  //     (04-PROTOCOL 4장 확정).
  onRoom(
    socket,
    'host.forceEnd',
    { requireHost: true, allowedStates: ['QUESTION_ACTIVE', 'QUESTION_RESOLVED'] },
    ({ socket: s, room }) => {
      if (!room.game) {
        sendError(s, 'INVALID_STATE', '진행 중인 게임이 없습니다.');
        return;
      }
      // ★★ QUESTION_ACTIVE 에서는 정답을 공개하지 않고 중단한다 (T11).
      //   ★ 경험 기록을 남기지 않는다. 정답을 보지 않았기 때문이다 (Q-25 / Q-47).
      //   ★ QUESTION_RESOLVED 에서는 이미 공개되고 기록도 남았다. 그대로 유지한다 (T12).
      if (room.state === 'QUESTION_ACTIVE') abortQuestionSync(room);
      finishGame(room, 'force_ended', '방장이 게임을 강제 종료했습니다.');
    },
  );

  // ── 다시 하기 / 로비로 (guide 38절 / T30 / T31)
  //   ★★ 서버 동작이 동일하다. UI 차이만 있다 (04-PROTOCOL T31).
  //     ★ 그래서 같은 핸들러를 두 이벤트에 등록한다. 분기를 만들지 않는다.
  for (const event of ['game.again', 'game.toLobby'] as const) {
    onRoom(
      socket,
      event,
      { requireHost: true, allowedStates: ['GAME_RESULT'] },
      ({ room }) => {
        returnToLobby(room);
      },
    );
  }

  // ── 방장이 접속 종료자를 강제 퇴장 (Q-15)
  onRoom<{ accountId: string }>(
    socket,
    'host.kickDisconnected',
    {
      requireHost: true,
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const accountId = parseString(obj.accountId, 1, 32);
        return accountId === null ? null : { accountId };
      },
    },
    ({ socket: s, room, payload }) => {
      const target = room.players.get(payload.accountId);
      if (!target) {
        sendError(s, 'BAD_REQUEST', '대상을 찾을 수 없습니다.');
        return;
      }
      if (target.connected) {
        sendError(s, 'INVALID_STATE', '접속 중인 사람은 내보낼 수 없습니다.');
        return;
      }
      removePlayer(room, payload.accountId);
      // ★ game_players 레코드는 유지한다. 그 게임 결과에는 남는다 (Q-48).
      //   ★ Phase 3 에서도 삭제하지 않는다. finalizeScores 가 그 행을 갱신한다.
      broadcastSystem(room, `${target.nickname} 님을 내보냈습니다.`);
      emitRoom(room, 'room.playerLeft', {
        accountId: payload.accountId,
        players: playerViews(room),
        activeCount: activeCount(room),
      });
      // ★ 참가자가 줄면 경험자 집합과 스킵 임계값이 바뀐다. 동기적으로 재평가한다
      if (room.currentQuestion) {
        room.currentQuestion.experiencedAccountIds.delete(payload.accountId);
        broadcastExperiencedUpdated(room);
        evaluateSkip(room);
        broadcastSkipVotes(room);
      }
      void refreshLobbyInfo(room);
    },
  );
}

/**
 * 결과 화면 → 로비 (T30 / T31).
 *
 * ★ 직전 게임 설정값만 복원한다. **자동으로 시작하지 않는다** (guide 38절 / Q-31).
 * ★★ 경험 기록은 초기화하지 않는다. 장기 자산이다 (guide 26절).
 * ★ 접속 종료자의 슬롯을 이 시점에 반환한다 (01-GAME-RULES 13장).
 */
function returnToLobby(room: NonNullable<ReturnType<typeof getRoom>>): void {
  // ★ 접속 종료자를 내보낸다. 게임 중에는 슬롯을 유지했고 지금이 반환 시점이다
  const removed: string[] = [];
  for (const p of [...room.players.values()]) {
    if (!p.connected) {
      removePlayer(room, p.accountId);
      removed.push(p.nickname);
    }
  }

  room.state = 'LOBBY';
  room.settingsLocked = false;
  room.countdownEndsAt = null;
  room.game = null;
  room.currentQuestion = null;
  room.result = null;
  room.chatTimestamps.clear();
  // ★ 점수만 초기화한다. 경험 기록은 DB 에 있고 건드리지 않는다
  for (const p of room.players.values()) p.score = 0;
  // ★ 직전 설정 복원 (Q-31)
  if (room.lastGameSettings) room.settings = { ...room.lastGameSettings };

  console.log(
    `[game] ${room.id} 로비로 복귀` +
      (removed.length > 0 ? ` (접속 종료자 ${removed.length}명 슬롯 반환)` : ''),
  );

  if (removed.length > 0) {
    broadcastSystem(room, `접속이 끊긴 ${removed.join(', ')} 님의 자리를 반환했습니다.`);
  }
  broadcastSystem(room, '── 로비 ──');
  emitRoom(room, 'game.returnedToLobby', {
    state: room.state,
    settings: { ...room.settings },
    settingsLocked: false,
    players: playerViews(room),
    activeCount: activeCount(room),
  });
  // ★ 경험 기록이 늘었으므로 경험률과 출제 가능 수를 다시 계산한다
  void refreshLobbyInfo(room);
}

// -----------------------------------------------------------------------------
function playerViews(room: ReturnType<typeof getRoom> & object) {
  const now = Date.now();
  return [...room.players.values()]
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((p) => toPlayerView(room, p, now));
}

function broadcastSystem(room: NonNullable<ReturnType<typeof getRoom>>, text: string): void {
  const entry = {
    id: randomUUID(),
    seq: nextSeq(),
    accountId: '',
    nickname: '',
    colorIndex: 0,
    rawNfc: text,
    maskedText: null,
    ts: Date.now(),
    system: true,
  };
  pushChat(room, entry);
  emitRoom(room, 'chat.message', {
    id: entry.id,
    seq: entry.seq,
    accountId: '',
    nickname: '',
    colorIndex: 0,
    text,
    masked: false,
    ts: entry.ts,
    system: true,
  });
}

/**
 * ★ 중간 참가자의 경험 기록을 불러 게임 상태에 합친다.
 *
 * ★★ 이 함수는 await 를 포함한다. **그래서 판정 블록이 아닌 곳에서만 부른다.**
 *   ★ 입장 처리는 판정 블록이 아니므로 허용된다 (04-PROTOCOL 3장의 1~5 와 같다).
 *
 * ★ 로드가 끝나기 전에 문제가 시작될 수 있다. 그 경우 그 문제 하나는
 *   이 사람의 경험 여부가 반영되지 않는다.
 *   ★ 그것을 감수한다 — 근거: 대안은 입장을 await 뒤로 미루는 것인데,
 *     그러면 입장 자체가 DB 지연만큼 늦어지고 스냅샷도 그만큼 늦게 간다.
 *   ★ 로드가 끝나면 현재 문제의 경험자 집합을 갱신하고 다시 알린다.
 */
async function onMidgameJoin(
  room: NonNullable<ReturnType<typeof getRoom>>,
  player: { accountId: string; colorIndex: number },
): Promise<void> {
  const game = room.game;
  if (!game) return;
  try {
    if (game.gameId) {
      await insertMidgamePlayer({
        gameId: game.gameId,
        accountId: player.accountId,
        colorIndex: player.colorIndex,
      });
    }
    const loaded = await loadExperienced([player.accountId]);
    const set = loaded.get(player.accountId) ?? new Set<string>();
    // ★ await 뒤 재확인. 그 사이 게임이 끝났거나 사람이 나갔을 수 있다
    if (room.game !== game) return;
    if (!room.players.has(player.accountId)) return;
    game.experienced.set(player.accountId, set);

    // ★ 현재 문제의 경험자 집합을 갱신한다
    const q = room.currentQuestion;
    if (q && set.has(q.questionId)) {
      q.experiencedAccountIds.add(player.accountId);
      broadcastExperiencedUpdated(room);
    }
  } catch (err) {
    console.error(`[room] ★ 중간 참가자 경험 기록 로드 실패:`, (err as Error).message);
  }
}

/** 소켓을 방에 붙이고 스냅샷을 보낸다 */
function attachToRoom(
  socket: Socket,
  roomId: string,
  reason: 'join' | 'reconnect',
): void {
  const data = socket.data as SocketData;
  const session = data.session;
  if (!session) {
    sendError(socket, 'UNAUTHENTICATED');
    return;
  }
  const room = getRoom(roomId);
  if (!room) {
    sendError(socket, 'ROOM_NOT_FOUND');
    return;
  }

  const added = addPlayer(room, session.accountId, session.nickname, socket.id);
  if (!added.ok) {
    sendError(socket, 'ROOM_FULL');
    return;
  }

  data.roomId = roomId;
  void socket.join(ioRoomName(roomId));

  // ★ 방장이 돌아왔으면 유예를 해제한다. 단 이미 이전되었다면 돌려주지 않는다 (Q-15).
  if (room.hostAccountId === session.accountId) room.hostGraceUntil = null;

  socket.emit('room.state', buildSnapshot(room, session.accountId, reason, currentSeq()));

  if (added.rejoined) {
    emitRoom(room, 'room.connectionChanged', {
      accountId: session.accountId,
      connected: true,
      activeCount: activeCount(room),
    });
  } else {
    broadcastSystem(room, `${session.nickname} 님이 입장했습니다.`);
    emitRoom(room, 'room.playerJoined', {
      player: toPlayerView(room, added.player),
      players: playerViews(room),
      activeCount: activeCount(room),
    });
    // ★★ 중간 참가 (guide 32절 / 01-GAME-RULES 13장)
    //   ★ 시작 점수는 0 이고 이후 문제부터 정상적으로 점수를 얻는다.
    //   ★ 경험 기록을 불러 게임 상태에 합친다 — 그러지 않으면 이 사람이
    //     이미 경험한 문제가 "미경험" 으로 취급되어 선정에 잘못 반영된다.
    if (room.game) void onMidgameJoin(room, added.player);
  }

  // ★ 스킵 임계값은 인원에 따라 바뀐다. 입장 즉시 재평가한다 (04-PROTOCOL 4장).
  //   ★ 입장으로 임계값이 올라가는 경우가 대부분이지만, 이미 도달한 상태가 될 수도 있다
  if (room.currentQuestion) {
    evaluateSkip(room);
    broadcastSkipVotes(room);
  }

  // ★ 참가자 집합이 바뀌면 경험률과 출제 가능 수를 다시 계산한다 (Q-12 / Q-21).
  //   ★ 재접속(rejoined)에서도 부른다. 그 사람 화면에는 값이 없기 때문이다.
  //     스냅샷에 캐시된 값이 실려 가지만, 그 방의 첫 입장이면 캐시 자체가 없다.
  //   ★ 주기 갱신이 아니라 이벤트 갱신이다. 타이머로 DB를 깨우지 않는다.
  void refreshLobbyInfo(room);
}

/**
 * 방 나가기.
 *
 * ★★ Phase 3 에서 규칙이 갈린다 (01-GAME-RILES 13장 "접속 종료").
 *   · LOBBY / GAME_RESULT 에서는 슬롯을 즉시 반환한다
 *   · ★ **게임 중에는 슬롯을 유지한다.** 점수·경험 기록·최종 결과에 남는다.
 *     ★ 반환 시점은 결과 화면에서 로비로 복귀할 때다 (returnToLobby).
 *   ★ 근거: 나갔다고 그 게임 결과에서 사라지면 순위가 왜곡된다.
 */
function leaveRoom(socket: Socket, roomId: string, accountId: string): void {
  const room = getRoom(roomId);
  if (!room) return;

  const inGame =
    room.state === 'QUESTION_ACTIVE' ||
    room.state === 'QUESTION_RESOLVED' ||
    room.state === 'COUNTDOWN';

  if (inGame) {
    // ★ 슬롯을 유지하고 접속 종료로만 처리한다.
    //   ★ 명시적 나가기와 예기치 못한 끊김을 구분하지 않는다 (Q-15).
    markDisconnected(room, accountId);
    const data0 = socket.data as SocketData;
    data0.roomId = undefined;
    void socket.leave(ioRoomName(roomId));
    socket.emit('room.left', { roomId });
    emitRoom(room, 'room.connectionChanged', {
      accountId,
      connected: false,
      activeCount: activeCount(room),
    });
    // ★ 인원이 줄면 스킵 임계값이 내려간다. 동기적으로 재평가한다
    evaluateSkip(room);
    broadcastSkipVotes(room);
    console.log(`[room] ${roomId} 게임 중 퇴장 — ★ 슬롯을 유지한다 (${accountId})`);
    return;
  }

  const player = removePlayer(room, accountId);
  const data = socket.data as SocketData;
  data.roomId = undefined;
  void socket.leave(ioRoomName(roomId));
  socket.emit('room.left', { roomId });

  if (!player) return;

  if (room.players.size === 0) {
    // 아무도 남지 않았으면 즉시 정리한다. tick 의 10분 대기를 기다릴 이유가 없다.
    // ★ 열린 게임 레코드를 먼저 닫는다. 방을 지운 뒤에는 gameId 를 알 수 없다.
    closeOpenGame(roomId, 'abandoned');
    unregisterRoom(roomId);
    void closeRoom(roomId).catch((err) =>
      console.error(`[room] ${roomId} closed_at 기록 실패:`, (err as Error).message),
    );
    console.log(`[room] 삭제 ${roomId} (마지막 참가자 퇴장)`);
    return;
  }

  broadcastSystem(room, `${player.nickname} 님이 퇴장했습니다.`);
  emitRoom(room, 'room.playerLeft', {
    accountId,
    players: playerViews(room),
    activeCount: activeCount(room),
  });
  // 참가자가 줄면 출제 가능 수가 줄어들 수 있다 (전원 경험 문제가 늘어난다)
  void refreshLobbyInfo(room);
}
