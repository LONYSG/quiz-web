// =============================================================================
// 게임 레코드 (games / game_players)
//
// ★ 진행 중에 game_players.final_score 를 UPDATE 하지 않는다 (R003 4-3 확정).
//   점수는 answer_events 로부터 완전히 계산할 수 있고, 문제마다 UPDATE 하면
//   같은 정보를 두 번 쓰는 것이 된다. 종료 시 한 번 확정 값을 넣는다.
//   ★ 이 파일에 문제별 점수 갱신 함수를 만들지 않는 것이 그 규칙의 구현이다.
//
// ★ 열린 게임(ended_at IS NULL)을 남기지 않는다.
//   프로세스가 죽으면 부팅 정리 절차가 server_restart 로 닫지만(bootCleanup.ts),
//   프로세스가 살아 있는 동안 방이 사라지는 경로(활성 0명 10분 / 마지막 참가자 퇴장)에서는
//   그 자리에서 닫아야 한다. 그러지 않으면 다음 기동 때 server_restart 로 잘못 기록된다.
// =============================================================================

import { query } from './pool.js';
import type { GameEndReason } from '@quiz/shared';

export interface NewGamePlayer {
  accountId: string;
  colorIndex: number;
  /** 게임 시작 이후에 들어온 참가자인가 (guide 32절) */
  isMidgameJoin: boolean;
}

export interface NewGame {
  roomId: string;
  settingQuestionCount: number;
  settingStartMode: 'instant' | 'countdown';
  /** 즉시 시작이면 null */
  settingCountdownSec: number | null;
  /** 시작 시점 출제 가능 수 검증 결과 (Q-21) */
  plannedQuestionCount: number;
}

/** games INSERT. 반환값은 games.id (bigint 라 문자열이다) */
export async function insertGame(game: NewGame): Promise<string> {
  const r = await query<{ id: string }>(
    `INSERT INTO games
       (room_id, setting_question_count, setting_start_mode,
        setting_countdown_sec, planned_question_count)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text AS id`,
    [
      game.roomId,
      game.settingQuestionCount,
      game.settingStartMode,
      game.settingCountdownSec,
      game.plannedQuestionCount,
    ],
  );
  return r.rows[0]!.id;
}

/**
 * game_players 다중 INSERT.
 *
 * ★ 한 번의 쿼리로 넣는다. unnest 로 배열을 행으로 펼친다.
 *   10명이면 10번 왕복하는 것과 차이가 크지 않지만, 부분 실패로
 *   "일부만 기록된 게임" 이 생기는 것을 막는 편이 중요하다.
 */
export async function insertGamePlayers(
  gameId: string,
  players: readonly NewGamePlayer[],
): Promise<void> {
  if (players.length === 0) return;
  await query(
    `INSERT INTO game_players (game_id, account_id, color_index, is_midgame_join)
     SELECT $1::bigint, x.account_id, x.color_index, x.is_midgame_join
       FROM unnest($2::bigint[], $3::smallint[], $4::boolean[])
            AS x(account_id, color_index, is_midgame_join)
     ON CONFLICT (game_id, account_id) DO NOTHING`,
    [
      gameId,
      players.map((p) => p.accountId),
      players.map((p) => p.colorIndex),
      players.map((p) => p.isMidgameJoin),
    ],
  );
}

/**
 * 게임 종료 기록.
 *
 * ★ 이미 닫힌 게임을 다시 닫지 않는다 (ended_at IS NULL 조건).
 *   같은 게임이 두 경로로 종료되는 경우(강제 종료 직후 방 삭제 등)에
 *   나중 사유가 먼저 사유를 덮어쓰면 기록이 왜곡된다.
 */
export async function endGame(
  gameId: string,
  reason: GameEndReason,
  endedQuestionCount: number,
): Promise<void> {
  await query(
    `UPDATE games
        SET ended_at = now(), end_reason = $2, ended_question_count = $3
      WHERE id = $1 AND ended_at IS NULL`,
    [gameId, reason, endedQuestionCount],
  );
}
