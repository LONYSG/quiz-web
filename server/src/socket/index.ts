// =============================================================================
// Socket.IO 핸들러
//
// Phase 1 범위: 방 생성 / 입장 / 퇴장 / 채팅 / 방장 강제 퇴장 / 시각 동기화
// Phase 2 범위: 게임 설정 / 경험률 / 게임 시작 / 카운트다운
// Phase 3 이후에 문제 출제와 정답 판정이 여기에 추가된다.
//
// ★ 모든 인바운드 이벤트는 socket/guard.ts 의 on / onRoom 을 통해 등록한다.
//   그러면 seq 부여와 세션·방·권한·상태·스키마 검사를 빼먹을 수 없다.
// =============================================================================

import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { RULES, validateRoomSettings } from '@quiz/shared';
import { closeRoom, findRoom, insertRoom } from '../db/rooms.js';
import { cancelCountdown, notEnoughMessage, requestStart } from '../game/start.js';
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
      phase: 'phase2',
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

  // ── 채팅 (Phase 1은 로비 채팅만. 정답 판정은 Phase 3)
  onRoom<{ text: string }>(
    socket,
    'chat.send',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const text = parseString(obj.text, 1, RULES.CHAT_MAX_LENGTH);
        return text === null ? null : { text };
      },
    },
    ({ seq, room, player, payload }) => {
      // ★ Phase 3에서 이 핸들러가 정답 판정 경로를 갖게 된다.
      //   그때 지켜야 할 순서는 docs/04-PROTOCOL.md 5장에 있다.
      //     단계 1 검증 → 단계 2 판정(동기, await 금지) → 단계 3 브로드캐스트 → 단계 4 DB
      //   지금은 단계 1과 3만 있다.
      const entry = {
        id: randomUUID(),
        seq,
        accountId: player.accountId,
        nickname: player.nickname,
        colorIndex: player.colorIndex,
        rawNfc: payload.text.normalize('NFC'),
        maskedText: null,
        ts: Date.now(),
        system: false,
      };
      pushChat(room, entry);

      // Phase 6에서 emitRoomPerPlayer 로 바뀐다 (마스킹). 지금은 전원 동일 페이로드다.
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
      //   Phase 3 이후에 game_players 를 쓰게 되면 여기서 삭제하지 않도록 주의한다.
      broadcastSystem(room, `${target.nickname} 님을 내보냈습니다.`);
      emitRoom(room, 'room.playerLeft', {
        accountId: payload.accountId,
        players: playerViews(room),
        activeCount: activeCount(room),
      });
      void refreshLobbyInfo(room);
    },
  );
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
  }

  // ★ 참가자 집합이 바뀌면 경험률과 출제 가능 수를 다시 계산한다 (Q-12 / Q-21).
  //   ★ 재접속(rejoined)에서도 부른다. 그 사람 화면에는 값이 없기 때문이다.
  //     스냅샷에 캐시된 값이 실려 가지만, 그 방의 첫 입장이면 캐시 자체가 없다.
  //   ★ 주기 갱신이 아니라 이벤트 갱신이다. 타이머로 DB를 깨우지 않는다.
  void refreshLobbyInfo(room);
}

function leaveRoom(socket: Socket, roomId: string, accountId: string): void {
  const room = getRoom(roomId);
  if (!room) return;
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
