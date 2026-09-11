// =============================================================================
// 방 생명주기 부수 처리
//
// ★★ 방이 사라지는 경로가 **넷**이다 (R015 에서 둘 늘었다).
//     · 마지막 참가자 퇴장 (LOBBY / GAME_RESULT)
//     · 활성 0명 10분 경과 (Q-14. tick)
//     · ★ 마지막 활성자가 **나가기 버튼**을 눌렀다 (Q-82. 즉시)
//     · ★ PAUSED 가 pauseAbandonMs(기본 5분)를 넘겼다 (Q-82. tick)
//   ★★ 네 경로 모두 **destroyRoom 하나**를 부른다.
//   ★ 근거: R007 에서 삭제 경로가 games 를 닫지 않아 부팅 정리 절차가
//     server_restart 로 잘못 기록하던 결함이 있었다.
//     ★ 경로가 넷이 되었으므로 한 곳으로 모으는 것이 더 중요해졌다.
// =============================================================================

import type { GameEndReason } from '@quiz/shared';
import { endGame } from '../db/games.js';
import { closeRoom } from '../db/rooms.js';
import { getRoom, unregisterRoom } from './registry.js';

/**
 * 방에 진행 중인 게임이 있으면 종료로 기록한다.
 *
 * ★ 동기 함수다. DB 쓰기는 기다리지 않는다.
 *   호출자(tick / leaveRoom)가 await 할 수 없는 자리이기 때문이다.
 *   실패하면 부팅 정리 절차가 다음 기동에서 닫는다. 데이터가 사라지지는 않는다.
 */
export function closeOpenGame(roomId: string, reason: GameEndReason): void {
  const room = getRoom(roomId);
  const game = room?.game;
  if (!game?.gameId) return;
  const gameId = game.gameId;
  const played = game.questionIndex;
  void endGame(gameId, reason, played).catch((err) =>
    console.error(`[room] ${roomId} 게임 ${gameId} 종료 기록 실패:`, (err as Error).message),
  );
  console.log(`[room] ${roomId} 게임 ${gameId} 종료 기록 (${reason}, 진행 ${played}문제)`);
}

/**
 * ★★ 방을 폭파한다. **모든 삭제 경로가 이 함수를 쓴다.**
 *
 * 순서가 중요하다.
 *   1. ★ 열린 게임 레코드를 먼저 닫는다 — 방을 지운 뒤에는 gameId 를 알 수 없다
 *   2. 메모리에서 지운다 (참가자의 accountRoom 매핑도 함께 풀린다)
 *   3. DB 의 rooms.closed_at 을 기록한다 (기다리지 않는다)
 *
 * ★ 동기 함수다. tick 과 소켓 핸들러 양쪽에서 await 없이 부른다.
 * ★ DB 쓰기가 실패해도 부팅 정리 절차가 다음 기동에서 닫는다. 데이터는 사라지지 않는다.
 */
export function destroyRoom(roomId: string, reason: GameEndReason, why: string): void {
  closeOpenGame(roomId, reason);
  unregisterRoom(roomId);
  void closeRoom(roomId).catch((err) =>
    console.error(`[room] ${roomId} closed_at 기록 실패:`, (err as Error).message),
  );
  console.log(`[room] ★ 삭제 ${roomId} (${why})`);
}
