// =============================================================================
// ★★ 방장 이전 — 한 곳 (R042)
//
// ★ 세 갈래가 모두 이 함수를 쓴다
//   (1) 방장이 **끊기면** 30초 유예 뒤 (Q-29 · tick.ts) — 대상: 접속 중인 사람 중 가장 먼저 들어온 사람(joinOrder 최소)
//   (2) ★ 방장이 **스스로 나가면 즉시** (R042 · 건우) — 대상은 같다
//   (3) ★ 방장이 **직접 넘기기** (R042 · 건우 — 강퇴/차단 팝업의 "방장 넘기기")
// ★ 넘어가면: 방 전체에 room.hostChanged + 시스템 채팅. 일시정지 중이면 재개 권한(canResume)이 새 방장에게 바로 보이게 상태를 다시 보낸다.
// ★ 원래 방장이 돌아와도 돌려주지 않는다 (Q-15 확정).
// =============================================================================

import { emitRoom } from './emit.js';
import { broadcastSystem } from './systemChat.js';
import { broadcastPauseStatus } from '../game/pause.js';
import type { Player, Room } from './types.js';

export type HostChangeReason = 'grace' | 'left' | 'handover';

export function transferHost(room: Room, to: Player, reason: HostChangeReason): void {
  const previous = room.hostAccountId;
  if (previous === to.accountId) return;
  room.hostAccountId = to.accountId;
  room.hostGraceUntil = null;
  console.log(`[room] ${room.id} 방장 이전(${reason}): ${previous} → ${to.accountId}`);
  emitRoom(room, 'room.hostChanged', { hostAccountId: to.accountId, nickname: to.nickname, reason });
  broadcastSystem(room, `${to.nickname} 님이 방장이 되었습니다.`);
  if (room.state === 'PAUSED') broadcastPauseStatus(room);
}
