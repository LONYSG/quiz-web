// =============================================================================
// 방 생명주기 부수 처리
//
// ★ 방이 사라지는 경로는 두 개다.
//     · 마지막 참가자 퇴장 (socket/index.ts leaveRoom)
//     · 활성 0명 10분 경과 (tick.ts)
//   두 경로 모두 "열린 게임 레코드를 닫는" 처리를 해야 한다.
//   한쪽만 고치면 나머지 경로에서 games.ended_at 이 NULL 로 남고,
//   다음 기동의 부팅 정리 절차가 server_restart 로 잘못 기록한다.
//   ★ 그래서 두 경로가 같은 함수를 부르게 한다.
// =============================================================================

import type { GameEndReason } from '@quiz/shared';
import { endGame } from '../db/games.js';
import { getRoom } from './registry.js';

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
