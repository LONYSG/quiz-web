// =============================================================================
// 브로드캐스트 헬퍼
//
// ★ 왜 두 종류만 두는가 (R003 3-2)
//   경험자 닉네임이 전원 공개로 바뀌었으므로(docs/07-DECISIONS.md D-011),
//   실제로 수신자마다 값이 달라야 하는 것은 chat.message 의 text / masked 하나뿐이다.
//   그래서 무거운 일반화 장치를 만들지 않는다. guide 52절의 "과복잡화 금지" 를 적용한다.
//
// ★ overrideFn 은 반드시 동기 함수여야 한다.
//   마스킹 계산에 필요한 정답 집합과 경험자 집합은 문제 시작 시점에 이미 메모리에 있다.
//   여기에 await 가 들어가면 브로드캐스트 순서가 흐트러진다.
// =============================================================================

import type { Server } from 'socket.io';
import type { Player, Room } from './types.js';

let io: Server | null = null;

export function bindIo(server: Server): void {
  io = server;
}

function requireIo(): Server {
  if (!io) throw new Error('bindIo() 가 먼저 호출되어야 합니다.');
  return io;
}

/** Socket.IO room 이름. 방 ID 를 그대로 쓰지 않고 접두어를 붙여 충돌을 막는다 */
export function ioRoomName(roomId: string): string {
  return `room:${roomId}`;
}

/** 방 전체에 동일한 페이로드를 보낸다. 대부분의 이벤트가 이것을 쓴다 */
export function emitRoom(room: Room, event: string, payload: unknown): void {
  requireIo().to(ioRoomName(room.id)).emit(event, payload);
}

/**
 * 수신자마다 일부 필드를 바꿔 보낸다.
 *
 * overrideFn(player) 이 부분 객체를 반환하면 base 와 병합해 개별 emit 한다.
 * null 을 반환하면 base 를 그대로 보낸다.
 *
 * ★ 사용처는 세 곳뿐이다 (R003 3-2)
 *   · chat.message 의 text / masked           ← 실제로 값이 갈리는 유일한 항목
 *   · question.started 의 selfExperienced      ← Phase 6
 *   · question.experiencedUpdated 의 selfExperienced ← Phase 6
 *   10명이므로 개별 emit 10회의 비용은 무시할 수 있다.
 */
export function emitRoomPerPlayer<T extends Record<string, unknown>>(
  room: Room,
  event: string,
  base: T,
  overrideFn: (player: Player) => Partial<T> | null,
): void {
  const server = requireIo();
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    const override = overrideFn(player);
    server.to(player.socketId).emit(event, override ? { ...base, ...override } : base);
  }
}

/** 한 사람에게만 보낸다. 에러 응답과 본인 전용 알림에 쓴다 */
export function emitToPlayer(player: Player, event: string, payload: unknown): void {
  if (!player.socketId) return;
  requireIo().to(player.socketId).emit(event, payload);
}

/** 소켓 ID로 직접 보낸다 */
export function emitToSocket(socketId: string, event: string, payload: unknown): void {
  requireIo().to(socketId).emit(event, payload);
}

/** 소켓을 강제로 끊는다. Q-06(계정당 연결 1개)에서 기존 연결을 승계할 때 쓴다 */
export function disconnectSocket(socketId: string): void {
  const socket = requireIo().sockets.sockets.get(socketId);
  socket?.disconnect(true);
}
