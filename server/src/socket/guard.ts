// =============================================================================
// 인바운드 이벤트 공통 처리 파이프라인
//
// ★ 검사 순서를 헬퍼로 강제한다 (R003 3-0).
//   개별 핸들러가 검사를 빼먹을 수 없게 만드는 것이 목적이다.
//   핸들러는 이미 검증된 컨텍스트만 받는다.
//
//   순서: seq 부여 → 세션 → 방 소속 → 권한 → 상태 → 페이로드 스키마
//
// ★ 클라이언트를 신뢰하지 않는다 (guide 44절).
//   클라이언트가 버튼을 숨기더라도 서버가 모든 액션의 권한과 상태를 다시 검사한다.
//
// ★ 핸들러 본문에 await 를 넣는 것 자체는 Phase 1에서는 허용된다.
//   그러나 Phase 3의 정답 판정 핸들러는 동기여야 한다.
//   그래서 handle() 은 동기 핸들러와 비동기 핸들러를 모두 받되,
//   판정 경로는 별도의 동기 전용 헬퍼를 쓰게 될 것이다 (docs/04-PROTOCOL.md 1장).
// =============================================================================

import type { Socket } from 'socket.io';
import type { RoomState } from '@quiz/shared';
import { nextSeq } from '../seq.js';
import { getRoom } from '../rooms/registry.js';
import type { Player, Room } from '../rooms/types.js';

export interface SocketSession {
  accountId: string;
  nickname: string;
  sessionId: string;
}

/** socket.data 에 담기는 것 */
export interface SocketData {
  session?: SocketSession;
  roomId?: string;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'INVALID_STATE'
  | 'BAD_REQUEST'
  | 'ROOM_FULL'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_CLOSED'
  | 'ALREADY_HAS_ROOM'
  | 'NOT_ENOUGH_QUESTIONS'
  | 'INTERNAL';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: '로그인이 필요합니다.',
  NOT_IN_ROOM: '방에 참가한 상태가 아닙니다.',
  NOT_HOST: '방장만 할 수 있습니다.',
  INVALID_STATE: '지금은 할 수 없습니다.',
  BAD_REQUEST: '요청 형식이 올바르지 않습니다.',
  ROOM_FULL: '방이 가득 찼습니다. (최대 10명)',
  ROOM_NOT_FOUND: '존재하지 않는 방입니다.',
  ROOM_CLOSED: '이미 종료된 방입니다.',
  ALREADY_HAS_ROOM: '이미 만든 방이 있습니다. 기존 방을 닫은 뒤 다시 시도해 주세요.',
  // ★ Q-21. 출제 가능 수 부족은 "지금은 할 수 없다"(INVALID_STATE)와 구분해야 한다.
  //   원인이 설정값이고, 사용자가 문제 수를 줄이면 해결되기 때문이다.
  //   detail 에 실제 가능 개수를 담아 화면이 구체적으로 안내한다.
  NOT_ENOUGH_QUESTIONS: '출제할 수 있는 문제가 부족합니다.',
  INTERNAL: '서버에서 문제가 발생했습니다.',
};

export function sendError(socket: Socket, code: ErrorCode, detail?: string): void {
  socket.emit('error', { code, message: ERROR_MESSAGES[code], detail: detail ?? null });
}

/** 검증을 통과한 핸들러가 받는 컨텍스트 */
export interface Ctx<P = unknown> {
  seq: number;
  socket: Socket;
  session: SocketSession;
  payload: P;
}

export interface RoomCtx<P = unknown> extends Ctx<P> {
  room: Room;
  player: Player;
}

export interface GuardOptions<P> {
  /** 방 소속을 요구한다 */
  requireRoom?: boolean;
  /** 방장 권한을 요구한다 (requireRoom 을 함축한다) */
  requireHost?: boolean;
  /** 허용되는 방 상태. 비우면 상태를 검사하지 않는다 */
  allowedStates?: readonly RoomState[];
  /** 페이로드 스키마 검증. 통과하면 파싱된 값을, 실패하면 null 을 반환한다 */
  parse?: (raw: unknown) => P | null;
}

type Handler<P> = (ctx: Ctx<P>) => void | Promise<void>;
type RoomHandler<P> = (ctx: RoomCtx<P>) => void | Promise<void>;

/**
 * 세션만 요구하는 이벤트를 등록한다.
 *
 * ★ 첫 줄에서 seq 를 부여한다. guide 18절이 요구하는 "처리 순서 추적" 의 근거다.
 */
export function on<P = unknown>(
  socket: Socket,
  event: string,
  options: GuardOptions<P>,
  handler: Handler<P>,
): void {
  socket.on(event, (raw: unknown) => {
    const seq = nextSeq();
    const session = (socket.data as SocketData).session;
    if (!session) {
      sendError(socket, 'UNAUTHENTICATED');
      return;
    }
    const payload = parsePayload(socket, event, options, raw);
    if (payload === undefined) return;

    void runHandler(socket, event, seq, () => handler({ seq, socket, session, payload }));
  });
}

/**
 * 방 소속(및 필요하면 방장 권한과 상태)을 요구하는 이벤트를 등록한다.
 */
export function onRoom<P = unknown>(
  socket: Socket,
  event: string,
  options: GuardOptions<P>,
  handler: RoomHandler<P>,
): void {
  socket.on(event, (raw: unknown) => {
    const seq = nextSeq();
    const data = socket.data as SocketData;

    // 1. 세션
    const session = data.session;
    if (!session) {
      sendError(socket, 'UNAUTHENTICATED');
      return;
    }

    // 2. 방 소속
    const room = data.roomId ? getRoom(data.roomId) : undefined;
    if (!room) {
      sendError(socket, 'NOT_IN_ROOM');
      return;
    }
    const player = room.players.get(session.accountId);
    if (!player) {
      sendError(socket, 'NOT_IN_ROOM');
      return;
    }

    // 3. 권한
    if (options.requireHost && room.hostAccountId !== session.accountId) {
      sendError(socket, 'NOT_HOST');
      return;
    }

    // 4. 상태
    if (options.allowedStates && !options.allowedStates.includes(room.state)) {
      sendError(socket, 'INVALID_STATE', `현재 상태: ${room.state}`);
      return;
    }

    // 5. 페이로드 스키마
    const payload = parsePayload(socket, event, options, raw);
    if (payload === undefined) return;

    void runHandler(socket, event, seq, () => handler({ seq, socket, session, payload, room, player }));
  });
}

function parsePayload<P>(
  socket: Socket,
  event: string,
  options: GuardOptions<P>,
  raw: unknown,
): P | undefined {
  if (!options.parse) return raw as P;
  const parsed = options.parse(raw);
  if (parsed === null) {
    // ★ 어느 이벤트에서 걸렸는지는 알려 준다 (R008 / D-027).
    //   "요청 형식이 올바르지 않습니다" 만 뜨면 사용자도 개발자도 원인을 찾을 수 없다.
    //   ★ 받은 값 자체는 담지 않는다. 채팅 본문 등이 그대로 되돌아오면 안 된다.
    sendError(socket, 'BAD_REQUEST', `${event} 요청의 형식이 올바르지 않습니다.`);
    return undefined;
  }
  return parsed;
}

/**
 * 핸들러 실행을 감싼다.
 * ★ 핸들러에서 던진 예외가 프로세스를 죽이지 않게 한다.
 *   게임 중 한 사람의 요청 처리 실패가 방 전체를 날리면 안 된다.
 */
async function runHandler(
  socket: Socket,
  event: string,
  seq: number,
  run: () => void | Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(`[socket] seq=${seq} ${event} 처리 실패:`, (err as Error).message);
    // ★ 사람에게도 알린다 (R008 / D-027).
    //   예전에는 로그만 남기고 끝냈다. 그러면 사용자 화면에서는 버튼을 눌렀는데
    //   아무 일도 일어나지 않는 것과 구분되지 않는다.
    //   ★ INTERNAL 은 그때까지 "정의만 되어 있고 한 번도 전송되지 않는" 코드였다.
    //   ★ 예외 메시지 자체는 보내지 않는다. 내부 구조나 값이 새어 나갈 수 있다.
    sendError(socket, 'INTERNAL', `${event} 처리 중 오류 (seq=${seq})`);
  }
}

// -----------------------------------------------------------------------------
// 스키마 파서
// -----------------------------------------------------------------------------

export function parseObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export function parseString(
  value: unknown,
  min: number,
  max: number,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}
