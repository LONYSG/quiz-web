// =============================================================================
// 전역 tick 루프
//
// ★ 방마다 setTimeout / setInterval 을 두지 않는다 (R003 2-4 확정).
//   타이머 핸들이 방 생명주기와 엉키면 누수와 중복 실행이 생긴다.
//   전역 tick 하나면 상태 검사가 한 곳에 모이고,
//   "tick 안에서는 다른 이벤트가 끼어들지 않는다" 는 성질을 그대로 활용할 수 있다.
//
// ★ Phase 1에서 검사하는 것은 세 가지뿐이다.
//   그러나 Phase 3~5에서 다음이 전부 여기 들어온다. 지금 뼈대를 세우는 이유다.
//     · COUNTDOWN 만료 → 첫 문제 시작
//     · 남은 10초 → 힌트 push
//     · 문제 종료 시각 도달 → 시간 종료 처리
//     · QUESTION_RESOLVED 5초 경과 → 다음 문제
//     · PAUSED 30분 초과 → 게임 포기
//
// ★ tick 콜백 안에서 await 를 쓰지 않는다.
//   DB 쓰기가 필요하면 void 로 띄우고 결과를 기다리지 않는다.
//   그러지 않으면 tick 이 밀려 "정확히 30초" 가 깨진다.
// =============================================================================

import { RULES } from '@quiz/shared';
import { closeRoom } from './db/rooms.js';
import { emitRoom } from './rooms/emit.js';
import { activeCount, allRooms, nextHostCandidate, unregisterRoom } from './rooms/registry.js';
import { toPlayerView } from './rooms/snapshot.js';
import type { Room } from './rooms/types.js';

let handle: NodeJS.Timeout | null = null;

/** 표시용 connected 가 바뀌는 순간을 잡기 위해, 방별 마지막 표시 상태를 기억한다 */
const lastDisplayState = new Map<string, string>();

export function startTick(): void {
  if (handle) return;
  handle = setInterval(tick, RULES.TICK_INTERVAL_MS);
  // 프로세스 종료를 막지 않게 한다
  handle.unref?.();
}

export function stopTick(): void {
  if (!handle) return;
  clearInterval(handle);
  handle = null;
}

function tick(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const room of allRooms()) {
    try {
      // Phase 3~5에서 여기 앞쪽에 게임 타이머 검사가 들어온다.
      // 순서가 중요하다: 게임 상태 전이 → 방장 이전 → 표시 갱신 → 방 삭제
      checkHostTransfer(room, now);
      checkDisconnectDisplay(room, now);
      if (shouldDeleteRoom(room, now)) toDelete.push(room.id);
    } catch (err) {
      // ★ 한 방의 오류가 다른 방의 tick 을 멈추게 하지 않는다.
      console.error(`[tick] 방 ${room.id} 처리 중 오류:`, (err as Error).message);
    }
  }

  for (const roomId of toDelete) {
    unregisterRoom(roomId);
    lastDisplayState.delete(roomId);
    // ★ DB 쓰기는 기다리지 않는다. 실패해도 부팅 정리 절차가 다음 기동에서 닫는다.
    void closeRoom(roomId).catch((err) =>
      console.error(`[tick] 방 ${roomId} closed_at 기록 실패:`, (err as Error).message),
    );
    console.log(`[tick] 방 삭제: ${roomId} (활성 0명 ${RULES.ROOM_IDLE_DELETE_MS / 60000}분 경과)`);
  }
}

/**
 * 방장 이전 (Q-29).
 *
 * ★ 활성 0명 동안에는 이 타이머를 정지한다. 이전할 대상이 없기 때문이다.
 *   R004 2-2 (4)에서 발견한 문제다. 정지하지 않으면 타이머만 만료되고 아무 일도 일어나지 않거나
 *   구현에 따라 오류가 난다.
 * ★ 30초 유예를 두는 이유: 새로고침(1~3초)으로 방장이 넘어가는 것을 막는다.
 */
function checkHostTransfer(room: Room, now: number): void {
  const host = room.players.get(room.hostAccountId);

  // 방장이 접속 중이면 유예를 해제한다
  if (host?.connected) {
    room.hostGraceUntil = null;
    return;
  }

  // ★ 활성 0명이면 타이머를 정지한다 (설정하지도, 만료시키지도 않는다)
  if (activeCount(room) === 0) return;

  if (room.hostGraceUntil === null) {
    room.hostGraceUntil = now + RULES.HOST_TRANSFER_GRACE_MS;
    return;
  }
  if (now < room.hostGraceUntil) return;

  const candidate = nextHostCandidate(room, room.hostAccountId);
  if (!candidate) {
    // 후보가 없으면 유예를 유지한다
    return;
  }

  const previous = room.hostAccountId;
  room.hostAccountId = candidate.accountId;
  room.hostGraceUntil = null;

  console.log(`[tick] 방 ${room.id} 방장 이전: ${previous} → ${candidate.accountId}`);
  emitRoom(room, 'room.hostChanged', {
    hostAccountId: candidate.accountId,
    nickname: candidate.nickname,
  });
  // ★ 원래 방장이 돌아와도 돌려주지 않는다 (Q-15 확정).
  //   여기서 previous 를 기억해 두지 않는 것이 그 구현이다.
}

/**
 * 접속 종료 표시 갱신 (Q-15 보완).
 *
 * 끊긴 뒤 5초가 지나면 점수판에 "접속 종료" 가 나타나야 한다.
 * 그 순간을 이벤트로 알려야 클라이언트가 갱신할 수 있다.
 *
 * ★ 매 tick 마다 브로드캐스트하지 않는다. 표시 상태가 실제로 바뀔 때만 보낸다.
 *   100ms 마다 10명분을 보내면 의미 없는 트래픽이 된다.
 */
function checkDisconnectDisplay(room: Room, now: number): void {
  let signature = '';
  for (const player of room.players.values()) {
    const shown = toPlayerView(room, player, now).connected;
    signature += `${player.accountId}:${shown ? 1 : 0};`;
  }

  const previous = lastDisplayState.get(room.id);
  if (previous === signature) return;
  lastDisplayState.set(room.id, signature);
  if (previous === undefined) return; // 첫 계산은 알리지 않는다

  emitRoom(room, 'room.playersUpdated', {
    players: [...room.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => toPlayerView(room, p, now)),
    activeCount: activeCount(room),
  });
}

/**
 * 방 삭제 조건 (Q-14).
 *
 * ★ PAUSED 중에는 이 타이머를 정지한다.
 *   그러지 않으면 10분 뒤 방이 사라져 일시정지가 무의미해진다.
 *   R004 2-2 (5)에서 확인한 결정적 항목이다.
 *   Phase 1에는 PAUSED 상태가 없지만 조건을 미리 넣어 둔다.
 */
function shouldDeleteRoom(room: Room, now: number): boolean {
  if (room.state === 'PAUSED') return false;
  if (activeCount(room) > 0) return false;
  if (room.emptySince === null) {
    room.emptySince = now;
    return false;
  }
  return now - room.emptySince >= RULES.ROOM_IDLE_DELETE_MS;
}
