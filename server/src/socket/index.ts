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
import { maskAnswers, NICKNAME_LIMIT_HINT, nicknameFits, RULES, validateRoomSettings } from '@quiz/shared';
import { closeRoom, findRoom, insertRoom, openRoomsHostedBy, updateRoomHost } from '../db/rooms.js';
import { insertMidgamePlayer, recordExperiences } from '../db/gameQuestions.js';
import { loadExperienced } from '../db/questionPool.js';
import { cancelCountdown, nicknameBlockMessage, notEnoughMessage, requestStart } from '../game/start.js';
import { checkChatRate, checkEmojiRate, judgeAnswer } from '../game/answer.js';
import {
  abortQuestionSync,
  broadcastExperiencedUpdated,
  broadcastPlayers,
  broadcastSkipVotes,
  evaluateSkip,
  finishGame,
  noteLateAnswer,
  recordAnswerEvent,
  resolveQuestionSync,
} from '../game/question.js';
import { broadcastPauseStatus, pauseIfNoActive, resumeGame } from '../game/pause.js';
import { config } from '../config.js';
import { refreshLobbyInfo } from '../lobby/info.js';
import { destroyRoom } from '../rooms/lifecycle.js';
import { readSessionToken, resolveSession } from '../auth/session.js';
import {
  bindAccountSockets,
  bindIo,
  disconnectSocket,
  emitRoom,
  emitRoomPerPlayer,
  emitToSocket,
  leaveIoRoom,
  ioRoomName,
} from '../rooms/emit.js';
import {
  activeCount,
  addPlayer,
  createRoomObject,
  generateRoomId,
  findRoomByCodeOrId,
  getRoom,
  getRoomOfAccount,
  markDisconnected,
  nextHostCandidate,
  pushChat,
  registerRoom,
  removePlayer,
  unregisterRoom,
  onAwayExpired,
} from '../rooms/registry.js';
import { transferHost } from '../rooms/host.js';
import { initFriends, onAccountOffline, onAccountOnline, registerFriendHandlers } from '../social/friends.js';

/** ★ R043 — 방을 만드는 중인 계정 (연타 무시) */
const creatingRooms = new Set<string>();
import { buildSnapshot, toPlayerView } from '../rooms/snapshot.js';
import { isEmojiId, isSpecialEmoji, ownedEmojiIds } from '../http/emojiRoutes.js';
import { broadcastSystem } from '../rooms/systemChat.js';
import type { Room } from '../rooms/types.js';
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
 * ★★★ 브로드캐스트용 마스킹 (Phase 6 / Q-35 / Q-42 / Q-43).
 *
 * ★★ **출력 변환이다. 입력 처리가 아니다.**
 *   ★ 정답 판정(game/answer.ts)은 이 함수를 부르지 않고, 이 함수는 판정 결과를 바꾸지 않는다.
 *     ★ 두 경로가 만나는 유일한 지점은 "같은 원문을 읽는다" 는 것뿐이다.
 *   ★ 그래서 이 함수가 틀려도 잃는 것은 **가려짐 여부**뿐이고, 승패는 영향을 받지 않는다.
 *
 * @returns 가릴 것이 있으면 치환된 문자열, 없으면 null
 */
function maskForBroadcast(room: Room, senderAccountId: string, rawNfc: string): string | null {
  // ★ (1) 정답이 아직 공개되지 않은 문제 진행 중일 때만
  if (room.state !== 'QUESTION_ACTIVE') return null;
  const q = room.currentQuestion;
  if (!q || q.resolved) return null;
  // ★ (2) 발신자가 이 문제의 경험자일 때만. ★★ 미경험자의 메시지는 절대 건드리지 않는다
  if (!q.experiencedAccountIds.has(senderAccountId)) return null;
  // ★ (3) 실제로 정답이 들어 있을 때만
  const result = maskAnswers(rawNfc, [...q.answersNorm]);
  return result.masked ? result.text : null;
}

/**
 * 계정별 현재 소켓. Q-06(계정당 활성 연결 1개)을 강제한다.
 * ★ 세션 레코드는 여러 개 허용하고 소켓 연결만 1개로 제한한다 (R003 4-1).
 */
const socketByAccount = new Map<string, string>();

export function registerSocketHandlers(io: Server): void {
  // ★ R043 — 친구 실시간 상태 (접속 소켓을 알려 준다)
  initFriends((accountId) => socketByAccount.get(accountId));
  // ★ R045 D — HTTP 로 닉네임 · 사진이 바뀌면 그 사람 소켓 세션도 고친다
  bindAccountSockets((accountId) => socketByAccount.get(accountId));
  // ★ R046 — 끊긴 채 60초가 지나면 tick 이 이 경로로 뺀다 (나간 것과 같다 · 점수는 같은 게임 동안 기억)
  onAwayExpired((room, accountId) => ejectPlayer(room, accountId, 'timeout'));
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
          avatarV: session.avatarV,
          mustChangePassword: session.mustChangePassword,
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
    // ★ R043 — 친구 상태 (접속 = 친구 목록을 읽어 둔다)
    onAccountOnline(accountId);

    socket.emit('session.established', {
      accountId,
      nickname: data.session.nickname,
      serverTime: Date.now(),
    });

    registerCommonHandlers(socket);
    registerRoomHandlers(socket);
    registerFriendHandlers(socket);

    // ── 재접속: 이미 방에 소속되어 있으면 자동으로 다시 붙인다
    const existingRoom = getRoomOfAccount(accountId);
    if (existingRoom) {
      attachToRoom(socket, existingRoom.id, 'reconnect');
    }

    socket.on('disconnect', () => {
      // ★ 승계된 소켓의 disconnect 가 새 소켓의 매핑을 지우지 않게 한다
      if (socketByAccount.get(accountId) === socket.id) {
        socketByAccount.delete(accountId);
        onAccountOffline(accountId);
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

      // ★★ Phase 5 — 활성 0명이 되면 **즉시** 일시정지한다 (T21 / Q-30 확정).
      //   ★ tick 을 기다리지 않는다. tick 은 100ms 뒤이고, 그 사이에 타이머가 흐른다.
      //   ★★ 이것이 "즉시. 유예 없음" 의 구현이다.
      //   ★ 이 경로는 **끊김**이다. 나가기 버튼은 leaveRoom 이 따로 처리한다 (Q-82).
      if (!pauseIfNoActive(room, Date.now())) {
        // ★ 아직 사람이 남아 있다. PAUSED 중이었다면 복귀 현황만 갱신한다
        broadcastPauseStatus(room);
      }
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
      // ★★ R043 — 만들기 연타: 처리 중인 요청이 있으면 조용히 무시한다 (옛: 두 번째가 DB 제약에 걸려 "이미 만든 방" 오류가 떴다)
      if (creatingRooms.has(session.accountId)) return;
      // 이미 어느 방에 있으면 거절한다. 한 사람이 두 방에 동시에 있을 수 없다.
      if (getRoomOfAccount(session.accountId)) {
        sendError(s, 'ALREADY_HAS_ROOM', '이미 방에 참가한 상태입니다.');
        return;
      }

      creatingRooms.add(session.accountId);
      const roomId = generateRoomId();
      let inserted: Awaited<ReturnType<typeof insertRoom>>;
      try {
        inserted = await insertRoom(roomId, payload.title, session.accountId);
        if (!inserted.ok) {
          // ★★ R046 — DB 가 아직 나를 어느 열린 방의 방장으로 안다. 메모리와 맞춘 뒤 한 번 더:
          //   메모리에 없는 방(죽은 줄) = 닫는다 / 다른 사람이 방장인 방(내가 나가며 넘겼다) = DB 방장을 그 사람으로.
          for (const id of await openRoomsHostedBy(session.accountId)) {
            const mem = getRoom(id);
            if (!mem) await closeRoom(id);
            else if (mem.hostAccountId !== session.accountId) await updateRoomHost(id, mem.hostAccountId);
          }
          inserted = await insertRoom(roomId, payload.title, session.accountId);
        }
      } finally {
        creatingRooms.delete(session.accountId);
      }
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
      if (already && already.id !== payload.roomId && already.code !== payload.roomId) {
        sendError(s, 'ALREADY_HAS_ROOM', '다른 방에 참가한 상태입니다.');
        return;
      }

      // ★★ R043 — 6자리 방 코드로도 들어온다 (긴 id · 초대 링크는 그대로)
      const room = findRoomByCodeOrId(payload.roomId);
      // ★★ R041 — 차단된 계정은 이 방에 다시 들어올 수 없다 (방이 살아 있는 동안)
      if (room?.bannedAccountIds.has(session.accountId)) {
        sendError(s, 'BANNED', '이 방에서 차단되어 들어갈 수 없습니다.');
        return;
      }
      if (!room) {
        // ★ guide 49절: "존재하지 않는 방" 과 "이미 종료된 방" 을 구분해 안내한다.
        //   메모리에 없으면 DB를 보고 closed_at 으로 판별한다.
        const row = await findRoom(payload.roomId);
        sendError(s, row ? 'ROOM_CLOSED' : 'ROOM_NOT_FOUND');
        return;
      }
      // ★★ R040 — 한도를 넘는 옛 닉네임은 **게임 중인 방에 새로 들어갈 수 없다** (로비에서 바꾸고 시작에 참여한다).
      //   ★ 대기실(LOBBY)에는 들어간다 — 들어가면 화면이 닉네임을 바꾸라고 안내한다. 재접속은 막지 않는다.
      if (!already && room.state !== 'LOBBY' && !nicknameFits(session.nickname)) {
        sendError(s, 'NICKNAME_CHANGE_REQUIRED', `게임 중인 방에는 닉네임을 바꾼 뒤 들어갈 수 있어요. (${NICKNAME_LIMIT_HINT})`);
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
    ({ seq, socket: s, room, player, payload, arrivedNs }) => {
      const now = Date.now();

      // ── 단계 1. 검증
      //   ★ rate limit 초과는 **본인에게만** 조용히 알린다 (Q-18).
      //     ★ 방 전체에 알리면 도배 자체가 알림이 된다.
      // ★ Q-84 — 설정값으로 덮을 수 있다. 기본은 1초 20개다.
      //   ★★ 기준이 "예절" 이 아니라 "서버 보호" 로 바뀌었다. 근거는 RULES 주석에 있다.
      // ★★ R048 개정 (D-228) — 5초 5회 · 넘으면 5초 잠금. 잠긴 동안 보낸 것은 버리고 본인에게만 남은 시간을 알린다
      const retryAfterMs = checkChatRate(room, player.accountId, now, {
        windowMs: config.tuning.chatRateWindowMs,
        max: config.tuning.chatRateMax,
        lockMs: config.tuning.chatRateLockMs,
      });
      if (retryAfterMs !== null) {
        s.emit('chat.throttled', { retryAfterMs, kind: 'chat' });
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

      // ── 단계 3. ★★★ 마스킹 (Phase 6 / Q-35).
      //
      //   ★★★ **이 지점이 중요하다.** 마스킹은 단계 2(판정)가 **끝난 뒤**에 실행된다.
      //     ★ 판정의 입력은 클라이언트가 보낸 원문(rawNfc)이고,
      //       마스킹은 그 원문을 **브로드캐스트용으로 변환**할 뿐이다.
      //     ★★ 즉 마스킹이 무엇을 하든 판정 결과(outcome)는 이미 확정되어 있다.
      //       ★ 마스킹 판정이 틀려도 정답 판정은 절대 영향을 받지 않는다 (R003 3-3 / D-073).
      //   ★★ 순서를 바꾸지 말 것. 마스킹을 위로 올리면 그 분리가 깨진다.
      //
      //   조건 세 가지를 모두 만족할 때만 가린다.
      //     (1) 지금이 QUESTION_ACTIVE 이고 아직 정답이 공개되지 않았다
      //         ★ 공개된 뒤에는 가릴 이유가 없다 (테스트 케이스 #15)
      //     (2) 발신자가 **이 문제의 경험자**다 (미경험자는 절대 가리지 않는다. #14)
      //     (3) 메시지에 정답이 실제로 들어 있다
      //   ★ 동기 코드다. 정답 집합은 이미 메모리에 있으므로 await 가 필요 없다.
      const masked = maskForBroadcast(room, player.accountId, rawNfc);

      const entry = {
        id: randomUUID(),
        seq,
        accountId: player.accountId,
        nickname: player.nickname,
        colorIndex: player.colorIndex,
        rawNfc,
        maskedText: masked,
        ts: now,
        system: false,
      };
      pushChat(room, entry);

      // ★★ 발신자 본인에게는 **원문**을 보낸다 (테스트 케이스 #16).
      //   ★ 근거: 자기가 무엇을 썼는지 모르면 대화가 불가능하다.
      //     ★ masked=true 는 그대로 실어 "남에게는 가려져서 나갔다" 를 알린다.
      //   ★ 개인별 분기는 emitRoomPerPlayer 하나로 한다. Phase 1 에서 만든 장치다.
      const chatBase = {
        id: entry.id,
        seq: entry.seq,
        accountId: entry.accountId,
        nickname: entry.nickname,
        colorIndex: entry.colorIndex,
        text: masked ?? rawNfc,
        masked: masked !== null,
        ts: entry.ts,
        system: false,
      };
      if (masked === null) {
        emitRoom(room, 'chat.message', chatBase);
      } else {
        emitRoomPerPlayer(room, 'chat.message', chatBase, (p) =>
          p.accountId === player.accountId ? { text: rawNfc } : null,
        );
      }

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
          // ★★ R038 — 뒷북의 기준점. 판정이 끝난 뒤에 적는다 (판정 블록은 그대로)
          if (room.currentQuestion) room.currentQuestion.winnerArrivedNs = arrivedNs;
          broadcastPlayers(room);
        }
      } else if (outcome.matched && outcome.rejectReason === 'already_resolved') {
        // ★★ R038 — 간발의 차로 늦은 정답 → 뒷북 명단 (조건은 noteLateAnswer)
        noteLateAnswer(room, player, payload.epoch, arrivedNs);
      }
    },
  );

  // ── ★★ 이모티콘 (R039 / D-187) — **번호**로 받는다. 정답 판정·마스킹을 거치지 않는다 (채팅이 아니라 따로 보내는 신호)
  //   ★ 채팅 로그에 작게 남긴다(모바일도 반응을 볼 수 있게). 도배 제한은 채팅과 같은 수준으로 따로 센다
  onRoom<{ emojiId: number }>(
    socket,
    'emoji.send',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const id = obj.emojiId;
        if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || !isEmojiId(id)) return null;
        return { emojiId: id };
      },
    },
    async ({ seq, socket: s, room, player, payload }) => {
      // ★★ R048 (D-230) — 특별 이모티콘(테마)은 **가진 사람만** 보낼 수 있다 (뽑기는 R049 — 규칙을 먼저 둔다)
      if (isSpecialEmoji(payload.emojiId) && !(await ownedEmojiIds(player.accountId)).has(payload.emojiId)) {
        sendError(s, 'BAD_REQUEST', '가지고 있지 않은 이모티콘입니다.');
        return;
      }
      const now = Date.now();
      // ★★ R048 (D-228) — 채팅과 같은 창+잠금(따로 센다). 옛 R039 는 조용히 버렸다 → 이번부터 본인에게 같은 안내
      const retryAfterMs = checkEmojiRate(room, player.accountId, now, {
        windowMs: config.tuning.emojiRateWindowMs,
        max: config.tuning.emojiRateMax,
        lockMs: config.tuning.emojiRateLockMs,
      });
      if (retryAfterMs !== null) {
        s.emit('chat.throttled', { retryAfterMs, kind: 'emoji' });
        return;
      }
      const entry = {
        id: randomUUID(),
        seq,
        accountId: player.accountId,
        nickname: player.nickname,
        colorIndex: player.colorIndex,
        rawNfc: '',
        maskedText: null,
        ts: now,
        system: false,
        emojiId: payload.emojiId,
      };
      pushChat(room, entry);
      emitRoom(room, 'chat.message', {
        id: entry.id,
        seq: entry.seq,
        accountId: entry.accountId,
        nickname: entry.nickname,
        colorIndex: entry.colorIndex,
        text: '',
        masked: false,
        ts: entry.ts,
        system: false,
        emojiId: entry.emojiId,
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
      //   ★ R025 — 보낸 필드만 바꾼다. 난이도를 안 보냈으면 **지금 값을 유지**한다.
      //     ★ 그러지 않으면 "문제 수만 고쳤더니 난이도가 전체로 풀렸다" 가 된다.
      //   ★ R034 — 분야도 같다.
      const valid = validateRoomSettings({
        difficulties: room.settings.difficulties,
        topics: room.settings.topics,
        ...payload,
      });
      if (!valid.ok) {
        sendError(s, 'BAD_REQUEST', valid.message);
        return;
      }

      const diffChanged =
        valid.settings.difficulties.join(',') !== room.settings.difficulties.join(',') ||
        valid.settings.topics.join(',') !== room.settings.topics.join(',');
      room.settings = { ...valid.settings };

      // ★ 출제 가능 수는 설정값과 무관하다(참가자 집합에만 의존한다).
      //   그래서 여기서 DB를 다시 조회하지 않고 캐시된 값을 함께 보낸다.
      //   숫자를 한 글자 고칠 때마다 쿼리가 나가지 않게 하기 위함이다.
      emitRoom(room, 'lobby.settingsUpdated', {
        settings: { ...room.settings },
        settingsLocked: room.settingsLocked,
        availableQuestionCount: room.availableQuestionCount,
      });
      // ★★ R025 / R034 — 난이도·분야는 출제 가능 수를 바꾼다. 바뀐 경우에만 다시 센다.
      //   ★ 결과는 refreshLobbyInfo 가 lobby.settingsUpdated 로 다시 보낸다
      if (diffChanged) void refreshLobbyInfo(room);
    },
  );

  // ── 게임 시작 (T01)
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
        case 'nickname':
          // ★ R040 — 방 전체에 알린다 (바꿔야 하는 사람도 이유를 본다)
          emitRoom(room, 'error', { code: 'NICKNAME_CHANGE_REQUIRED', message: nicknameBlockMessage(result.nicknames), detail: result.nicknames.join(',') });
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
  //
  //   ★★ R015 — PAUSED(pausedFrom=COUNTDOWN)에서도 취소할 수 있게 했다.
  //     ★ 왜 — Phase 5 에서 COUNTDOWN 도 PAUSED 로 간다 (T20).
  //       ★★ 그런데 PAUSED 의 방장 액션은 재개/강제종료/강퇴뿐이다.
  //         ★ 그러면 카운트다운을 취소하고 싶은 방장이 **막다른 길에 갇힌다** —
  //           "재개해서 게임을 시작시킨 뒤 강제 종료" 밖에 길이 없다.
  //       ★ 게임이 아직 시작도 안 했는데 games 레코드가 하나 생기고 끝난다. 이상하다.
  //     → ★ 취소를 허용한다. 상태를 LOBBY 로 되돌리는 것뿐이라 위험하지 않다.
  onRoom(
    socket,
    'game.cancelCountdown',
    { requireHost: true, allowedStates: ['COUNTDOWN', 'PAUSED'] },
    ({ socket: s, room }) => {
      if (room.state === 'PAUSED') {
        if (room.paused?.pausedFrom !== 'COUNTDOWN') {
          sendError(s, 'INVALID_STATE', '카운트다운 중에 멈춘 것이 아닙니다.');
          return;
        }
        // ★ 일시정지를 풀고 카운트다운 상태로 되돌린 뒤 취소한다.
        //   ★ cancelCountdown 이 COUNTDOWN 을 전제하므로 순서를 맞춘다
        room.paused = null;
        room.state = 'COUNTDOWN';
      }
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
    {
      requireHost: true,
      // ★ PAUSED 에서도 강제 종료할 수 있다 (T13 / 04-PROTOCOL 3장)
      allowedStates: ['QUESTION_ACTIVE', 'QUESTION_RESOLVED', 'PAUSED'],
    },
    ({ socket: s, room }) => {
      if (!room.game) {
        sendError(s, 'INVALID_STATE', '진행 중인 게임이 없습니다.');
        return;
      }
      // ★★ 정답을 공개하지 않은 상태에서 끝내면 중단 기록을 남긴다 (T11 / T13).
      //   ★ 경험 기록을 남기지 않는다. 정답을 보지 않았기 때문이다 (Q-25 / Q-47).
      //   ★ QUESTION_RESOLVED 에서는 이미 공개되고 기록도 남았다. 그대로 유지한다 (T12).
      const pausedFrom = room.paused?.pausedFrom;
      if (room.state === 'QUESTION_ACTIVE' || pausedFrom === 'QUESTION_ACTIVE') {
        abortQuestionSync(room);
      }
      // ★★ R035 (R034 결정 ② · 건우 이견 없음) — **마지막 문제의 정답 공개 중**이면 모든 문제가 이미 끝났다.
      //   ★ 그때의 강제 종료는 "결과로 바로 가기" 일 뿐이므로 종료 사유를 **completed** 로 남긴다 (D-163).
      const resolvedPhase = room.state === 'QUESTION_RESOLVED' || pausedFrom === 'QUESTION_RESOLVED';
      const cur = room.currentQuestion;
      const lastDone = resolvedPhase && cur !== null && cur.resolved && cur.index >= room.game.totalQuestions;
      room.paused = null;
      if (lastDone) finishGame(room, 'completed', null);
      else finishGame(room, 'force_ended', '방장이 게임을 강제 종료했습니다.');
    },
  );

  // ── ★★ 재개 (T23). **방장만.** 자동 재개는 없다 (Q-30 확정)
  onRoom(
    socket,
    'game.resume',
    { requireHost: true, allowedStates: ['PAUSED'] },
    ({ socket: s, room }) => {
      const r = resumeGame(room);
      if (r.ok) return;
      switch (r.reason) {
        case 'no_active':
          sendError(s, 'INVALID_STATE', '접속 중인 참가자가 없습니다.');
          return;
        case 'not_paused':
          sendError(s, 'INVALID_STATE', '일시정지 상태가 아닙니다.');
          return;
        default:
          sendError(s, 'INTERNAL', '재개할 게임 상태를 찾지 못했습니다.');
      }
    },
  );

  // ── 로비로 (guide 38절 / T31) — 설정을 바꿀 수 있게 로비로 간다
  onRoom(
    socket,
    'game.toLobby',
    { requireHost: true, allowedStates: ['GAME_RESULT'] },
    ({ room }) => {
      returnToLobby(room);
    },
  );

  // ── ★★ 다시 하기 (T30 — R035 Q-31·Q-48 개정 / D-162)
  //   ★ 건우: "'다시 하기' 는 현재 세팅 그대로 5초 후 바로 시작되어야 맞다."
  //   ★ 순서: 로비로 정리(접속 종료자 자리 반환 · 점수 초기화 · 설정 복원) → **곧바로** 5초 카운트다운(T01).
  //     ★ 참가자 = 그 순간 접속 중인 사람 (returnToLobby 가 접속 종료자를 뺀다. 결과 화면에 새로 들어온 사람은 포함)
  //   ★ 문제가 부족하거나 시작할 수 없으면 로비에 남기고 **방 전체에** 이유를 알린다.
  onRoom(
    socket,
    'game.again',
    { requireHost: true, allowedStates: ['GAME_RESULT'] },
    async ({ room }) => {
      returnToLobby(room);
      const r = await requestStart(room);
      if (r.ok) return;
      if (r.reason === 'not_enough') {
        emitRoom(room, 'error', {
          code: 'NOT_ENOUGH_QUESTIONS',
          message: `다시 하기를 시작하지 못했습니다. ${notEnoughMessage(r.available, r.wanted)}`,
          detail: null,
        });
      } else if (r.reason === 'nickname') {
        emitRoom(room, 'error', { code: 'NICKNAME_CHANGE_REQUIRED', message: nicknameBlockMessage(r.nicknames), detail: r.nicknames.join(',') });
      } else if (r.reason !== 'busy' && r.reason !== 'invalid_state') {
        emitRoom(room, 'error', {
          code: 'INVALID_STATE',
          message: '다시 하기를 시작하지 못했습니다. 로비에서 다시 시작해 주세요.',
          detail: r.reason,
        });
      }
    },
  );

  // ── ★★★ R041 — 강퇴 · 차단 (방장). 옛 "접속 종료자 내보내기"(Q-15)는 강퇴에 합쳤다 (host.kickDisconnected 는 같은 처리)
  //   · 강퇴 = 이 방에서 내보낸다. 링크로 다시 들어올 수 있다
  //   · 차단 = 내보내고, 이 방이 살아 있는 동안 다시 못 들어온다 (room.bannedAccountIds)
  //   · 게임 중이면 판에서 빠진다 → 순위(결과)는 방의 참여자 목록으로 계산하므로 순위에서도 빠진다.
  //     이미 남은 경험 기록 · game_players 행은 그대로 둔다 (Q-48).
  //   · 인원이 바뀌면 경험자 집합 · 스킵 투표(분자·분모)를 **바로** 다시 계산한다
  //   · 자기 자신은 안 된다. 방장만 (requireHost)
  const kick = (s: Socket, room: Room, accountId: string, ban: boolean, me: string) => {
    const target = room.players.get(accountId);
    if (!target) {
      sendError(s, 'BAD_REQUEST', '대상을 찾을 수 없습니다.');
      return;
    }
    if (accountId === me) {
      sendError(s, 'BAD_REQUEST', '자기 자신은 내보낼 수 없습니다.');
      return;
    }
    // ★★ R046 — 강퇴 · 차단도 나가기와 같은 한 경로 (즉시 빠짐 · 0점부터)
    ejectPlayer(room, accountId, ban ? 'ban' : 'kick');
  };
  const parseKick = (raw: unknown) => {
    const obj = parseObject(raw);
    if (!obj) return null;
    const accountId = parseString(obj.accountId, 1, 32);
    if (accountId === null) return null;
    return { accountId, ban: obj.ban === true };
  };
  onRoom<{ accountId: string; ban: boolean }>(
    socket,
    'host.kick',
    { requireHost: true, parse: parseKick },
    ({ socket: s, room, session, payload }) => kick(s, room, payload.accountId, payload.ban, session.accountId),
  );
  // ── ★★ R042 — 방장 넘기기 (강퇴/차단 팝업의 세 번째 갈래). 접속 중인 다른 사람에게만. 어느 상태에서나
  onRoom<{ accountId: string }>(
    socket,
    'host.transfer',
    {
      requireHost: true,
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const accountId = parseString(obj.accountId, 1, 32);
        return accountId === null ? null : { accountId };
      },
    },
    ({ socket: s, room, session, payload }) => {
      const target = room.players.get(payload.accountId);
      if (!target || payload.accountId === session.accountId) {
        sendError(s, 'BAD_REQUEST', '넘겨받을 사람을 찾을 수 없습니다.');
        return;
      }
      if (!target.connected) {
        sendError(s, 'INVALID_STATE', '접속 중인 사람에게만 방장을 넘길 수 있습니다.');
        return;
      }
      transferHost(room, target, 'handover');
    },
  );
  // ★ 옛 이름 (Q-15) — 접속 종료자 내보내기. 이제 강퇴와 같은 처리다 (접속 중인 사람도 된다)
  onRoom<{ accountId: string; ban: boolean }>(
    socket,
    'host.kickDisconnected',
    { requireHost: true, parse: parseKick },
    ({ socket: s, room, session, payload }) => kick(s, room, payload.accountId, false, session.accountId),
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
      // ★ R046 — 빠진 것은 채팅에 남긴다 (나간 것과 같은 문구)
      broadcastSystem(room, `${p.nickname} 님이 나갔습니다.`);
    }
  }
  // ★ R046 — 게임이 끝났다 → 끊겨서 빠진 사람의 점수 기억도 끝 (다음 게임은 모두 0점부터)
  room.departedScores.clear();

  room.state = 'LOBBY';
  room.settingsLocked = false;
  room.countdownEndsAt = null;
  room.game = null;
  room.currentQuestion = null;
  room.result = null;
  room.chatTimestamps.clear();
  room.chatLocks?.clear();
  room.emojiTimestamps?.clear();
  room.emojiLocks?.clear();
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
    // ★★ 정답 공개 구간에 들어온 사람도 그 문제의 경험 기록을 남긴다 (01-GAME-RULES 12장 · R035 에서 구현 — D-168)
    recordResolvedWitness(room, player.accountId);
  } catch (err) {
    console.error(`[room] ★ 중간 참가자 경험 기록 로드 실패:`, (err as Error).message);
  }
}

/**
 * ★★ 정답 공개 구간(QUESTION_RESOLVED)에 입장·재접속한 사람의 경험 기록 (01-GAME-RULES 12장 "공개 구간에 입장한 사람도 기록")
 *
 * ★ R035 확인 (원칙 7) — 규칙 문서에는 있었지만 코드는 **정답이 공개되는 순간 접속 중인 사람만** 기록했다.
 *   정답 공개가 8초로 길어지며 차이가 커져 여기서 구현했다 (D-168).
 * ★ 메모리(다음 문제 선정)와 DB 를 함께 갱신한다. 이미 기록이 있으면 아무 일도 없다.
 * ★ 동기 부분만 판정 경로에 닿는다 — DB 쓰기는 기다리지 않는다.
 */
function recordResolvedWitness(room: NonNullable<ReturnType<typeof getRoom>>, accountId: string): void {
  const game = room.game;
  const q = room.currentQuestion;
  if (!game || !q || room.state !== 'QUESTION_RESOLVED' || !q.resolved) return;
  // ★ 중단(정답 미공개)된 문제는 기록하지 않는다 (Q-47)
  if (game.resolution?.reason === 'aborted') return;
  let set = game.experienced.get(accountId);
  if (!set) {
    set = new Set();
    game.experienced.set(accountId, set);
  }
  if (set.has(q.questionId)) return;
  set.add(q.questionId);
  if (game.gameId) {
    void recordExperiences({ accountIds: [accountId], questionId: q.questionId, gameId: game.gameId }).catch((err) =>
      console.error('[room] ★ 공개 구간 입장자 경험 기록 실패:', (err as Error).message),
    );
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

  // ★ R046 — "접속 끊김" 이 보이던 사람이 돌아왔나 (5초 표시 유예를 넘겼다) → 채팅에 "다시 들어왔습니다"
  const before = room.players.get(session.accountId);
  const wasShownAway = Boolean(before && !before.connected && before.disconnectedAt !== null && Date.now() - before.disconnectedAt >= RULES.DISCONNECT_DISPLAY_GRACE_MS);
  const added = addPlayer(room, session.accountId, session.nickname, socket.id, session.avatarV);
  if (!added.ok) {
    sendError(socket, 'ROOM_FULL');
    return;
  }
  // ★★ R046 — 끊겨서(타의) 빠졌던 사람이 **같은 게임**에 돌아왔다 → 점수를 되살린다 (건우 확정)
  let restored = false;
  if (!added.rejoined) {
    const saved = room.departedScores.get(session.accountId);
    if (saved && room.game && saved.gameId === room.game.gameId && isInGame(room)) {
      added.player.score = saved.score;
      restored = true;
    }
    room.departedScores.delete(session.accountId);
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
    // ★★ 정답이 공개되던 순간 끊겨 있었다가 공개 구간에 돌아왔다 — 정답을 본다 (D-168)
    recordResolvedWitness(room, session.accountId);
    // ★ R040 — 다시 들어왔더니 닉네임·사진이 바뀌어 있다 → 다른 사람 화면의 참여자 목록도 고친다 (옛 긴 닉네임 안내 등)
    if (added.profileChanged) broadcastPlayers(room);
    if (wasShownAway) broadcastSystem(room, `${session.nickname} 님이 다시 들어왔습니다.`);
  } else {
    broadcastSystem(room, restored ? `${session.nickname} 님이 다시 들어왔습니다. (점수 ${added.player.score}점 이어서)` : `${session.nickname} 님이 입장했습니다.`);
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
  if (room.currentQuestion && room.state === 'QUESTION_ACTIVE') {
    evaluateSkip(room);
    broadcastSkipVotes(room);
  }

  // ★★ PAUSED 중이면 복귀 현황을 갱신한다.
  //   ★★★ **여기서 자동으로 재개하지 않는다.** 방장이 눌러야 한다 (Q-30 확정).
  //     ★ 근거: 자동 재개면 먼저 들어온 한 명 때문에, 나머지가 새 URL 을 입력하는
  //       동안 문제가 소모된다. ★ 터널이 끊겨 새 링크를 뿌리면 정확히 그 상황이다.
  if (room.paused) broadcastPauseStatus(room);

  // ★ 참가자 집합이 바뀌면 경험률과 출제 가능 수를 다시 계산한다 (Q-12 / Q-21).
  //   ★ 재접속(rejoined)에서도 부른다. 그 사람 화면에는 값이 없기 때문이다.
  //     스냅샷에 캐시된 값이 실려 가지만, 그 방의 첫 입장이면 캐시 자체가 없다.
  //   ★ 주기 갱신이 아니라 이벤트 갱신이다. 타이머로 DB를 깨우지 않는다.
  void refreshLobbyInfo(room);
}

/** 게임이 진행 중인 상태 (카운트다운 · 문제 · 정답 공개 · 일시정지) */
function isInGame(room: Room): boolean {
  return room.state === 'COUNTDOWN' || room.state === 'QUESTION_ACTIVE' || room.state === 'QUESTION_RESOLVED' || room.state === 'PAUSED';
}

/** 빠지는 까닭 — 자의(left) · 타의 끊김 60초(timeout) · 강퇴(kick) · 차단(ban) */
export type EjectReason = 'left' | 'timeout' | 'kick' | 'ban';

/**
 * ★★★ R046 (건우 확정 — Q-15 · Q-82 개정) — 방에서 **즉시** 뺀다. 나가기 · 다른 방으로 옮기기 · 강퇴 · 차단 · 끊김 60초가 모두 이 한 경로다.
 *
 *   건우: "어쨌든 세션에서 나가게 된 사람은 남기지 말고, 나간 것과 동일한 효과로 제외시키자."
 *   → 자리 반환 · 순위(결과는 방 참여자로 계산)에서 빠짐 · 스킵 표 · 경험자 집합 · 출제 가능 수 · 인원을 **바로** 다시 계산한다.
 *
 *   ┌──────────────────────────┬─────────────────────────────────────┬─────────────────────┐
 *   │ 자의 — 나가기 · 옮기기   │ 즉시 빠진다                          │ 다시 오면 0점부터   │
 *   │ 강퇴 · 차단               │ 즉시 빠진다 (차단은 다시 못 온다)     │ 0점부터 / —         │
 *   │ 타의 — 끊김 60초 (tick)   │ 60초가 지나면 빠진다                  │ 같은 게임이면 점수 이어서 │
 *   └──────────────────────────┴─────────────────────────────────────┴─────────────────────┘
 *   ★ 방장이면 먼저 넘긴다(가장 먼저 들어온 접속자). ★ 자의로 나가는데 게임 중이고 나 말고 접속자가 없으면 즉시 방 폭파(Q-82).
 *   ★ 방이 비면 정리한다. ★ 채팅: 나감 · 60초 = "○○ 님이 나갔습니다." / 강퇴 · 차단 = "○○ 님을 내보냈습니다 / 차단했습니다."
 *   ★ game_players 행 · 이미 남은 경험 기록은 그대로 둔다 (Q-48).
 */
export function ejectPlayer(room: Room, accountId: string, reason: EjectReason): void {
  const target = room.players.get(accountId);
  if (!target) return;
  const inGame = isInGame(room);
  const othersActive = [...room.players.values()].some((p) => p.accountId !== accountId && p.connected);

  // ★ 방장이면 넘길 사람을 먼저 정해 둔다 (넘기는 것은 "나갔습니다" 다음 — 채팅 순서가 자연스럽게)
  const nextHost = room.hostAccountId === accountId ? nextHostCandidate(room, accountId) : null;

  // ★ 점수 되살림은 **타의(끊김)로 빠진 사람이 같은 게임에 돌아올 때만** (건우 확정). 그 밖에는 지운다(0점부터)
  if (reason === 'timeout' && inGame && room.game) room.departedScores.set(accountId, { gameId: room.game.gameId, score: target.score });
  else room.departedScores.delete(accountId);
  if (reason === 'ban') room.bannedAccountIds.add(accountId);

  // 당사자 화면 — 아직 붙어 있으면 방에서 떼고 알린다
  if (target.socketId) {
    if (reason === 'kick' || reason === 'ban') emitToSocket(target.socketId, 'room.kicked', { roomId: room.id, banned: reason === 'ban' });
    else emitToSocket(target.socketId, 'room.left', { roomId: room.id });
    leaveIoRoom(target.socketId, room.id);
  }
  removePlayer(room, accountId);

  // ★ 방이 비었다 · ★★ Q-82 — 자의로 나간 사람이 게임 중 마지막 접속자였다 → 즉시 폭파 (PAUSED 로 가지 않는다)
  if (room.players.size === 0 || (reason === 'left' && inGame && !othersActive)) {
    if (room.state === 'QUESTION_ACTIVE') abortQuestionSync(room);
    destroyRoom(room.id, 'abandoned', room.players.size === 0 ? '마지막 참가자 퇴장' : '★ 마지막 접속자가 나가기를 눌렀다 (Q-82)');
    return;
  }

  broadcastSystem(
    room,
    reason === 'kick' ? `${target.nickname} 님을 내보냈습니다.` : reason === 'ban' ? `${target.nickname} 님을 차단했습니다.` : `${target.nickname} 님이 나갔습니다.`,
  );
  if (nextHost) transferHost(room, nextHost, reason === 'timeout' ? 'grace' : 'left');
  emitRoom(room, 'room.playerLeft', {
    accountId,
    players: playerViews(room),
    activeCount: activeCount(room),
  });
  if (room.currentQuestion) {
    room.currentQuestion.skipVotes.delete(accountId);
    room.currentQuestion.experiencedAccountIds.delete(accountId);
    broadcastExperiencedUpdated(room);
    evaluateSkip(room);
    broadcastSkipVotes(room);
  }
  if (inGame && !pauseIfNoActive(room, Date.now())) broadcastPauseStatus(room);
  // 참가자가 줄면 출제 가능 수가 바뀔 수 있다 (전원 경험 문제)
  void refreshLobbyInfo(room);
  console.log(`[room] ${room.id} ${reason === 'timeout' ? '끊김 60초 — ' : ''}빠짐 (${reason}) ${accountId}`);
}

/**
 * 방 나가기 (자의 — 나가기 버튼 · 다른 방으로 옮기기).
 *
 * ★★★ R046 — 즉시 빠진다(ejectPlayer). 옛 코드는 게임 중 나가기를 **끊김과 똑같이**(Q-15 · 슬롯 유지) 처리해
 *   방 소속(accountRoom)이 남았다 → 새 방 만들기 · 다른 방 들어가기 · 초대 수락이 "이미 방이 있다" 로 막혔고,
 *   채팅에도 아무것도 남지 않았다 (건우 버그 — 코드로 확인).
 */
function leaveRoom(socket: Socket, roomId: string, accountId: string): void {
  const data = socket.data as SocketData;
  data.roomId = undefined;
  void socket.leave(ioRoomName(roomId));
  const room = getRoom(roomId);
  if (!room || !room.players.has(accountId)) {
    socket.emit('room.left', { roomId });
    return;
  }
  ejectPlayer(room, accountId, 'left');
}
