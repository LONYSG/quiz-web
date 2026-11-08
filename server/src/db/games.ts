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
  /** ★★★ R079 — 팀전 팀(0030) · 팀전이 아니면 null */
  team?: 'blue' | 'red' | null;
}

/**
 * ★★★ R079 (0030) — games.team_mode · game_players.team 이 있는 DB 인가.
 *   0030 을 아직 안 넣은 DB(메뉴 1 에서 마이그레이션을 건너뜀)에서도 게임이 시작되게, 열이 없다는 오류(42703)를 한 번 보면
 *   옛 꼴로 다시 쓰고 이후로는 옛 꼴만 쓴다(R074 rate_ask 와 같은 꼴).
 */
let teamCols = true;
export function teamColumnsAvailable(): boolean {
  return teamCols;
}
async function withTeamCols<T>(fresh: () => Promise<T>, legacy: () => Promise<T>): Promise<T> {
  if (!teamCols) return legacy();
  try {
    return await fresh();
  } catch (err) {
    if ((err as { code?: string }).code !== '42703') throw err;
    teamCols = false;
    console.error('[game] ★ 0030(팀전 열)이 없는 DB — 팀 기록 없이 이어간다. 메뉴 1 [1] 에서 migrate 를 넣어 주세요.');
    return legacy();
  }
}

export interface NewGame {
  roomId: string;
  settingQuestionCount: number;
  settingStartMode: 'instant' | 'countdown';
  /** 즉시 시작이면 null */
  settingCountdownSec: number | null;
  /** 시작 시점 출제 가능 수 검증 결과 (Q-21) */
  plannedQuestionCount: number;
  /** ★★★ R057 — 'minigame' = 미니게임만 판(0021) · 그때 미니게임 수 */
  mode: 'quiz' | 'minigame';
  settingMinigameRounds: number | null;
  /** ★★★ R079 — 팀전 판 (0030 games.team_mode) */
  teamMode?: boolean;
}

/** games INSERT. 반환값은 games.id (bigint 라 문자열이다) */
export async function insertGame(game: NewGame): Promise<string> {
  const params = [
    game.roomId,
    game.settingQuestionCount,
    game.settingStartMode,
    game.settingCountdownSec,
    game.plannedQuestionCount,
    game.mode,
    game.settingMinigameRounds,
  ];
  const r = await withTeamCols(
    () =>
      query<{ id: string }>(
        `INSERT INTO games
           (room_id, setting_question_count, setting_start_mode,
            setting_countdown_sec, planned_question_count, mode, setting_minigame_rounds, team_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id::text AS id`,
        [...params, game.teamMode === true],
      ),
    () =>
      query<{ id: string }>(
        `INSERT INTO games
           (room_id, setting_question_count, setting_start_mode,
            setting_countdown_sec, planned_question_count, mode, setting_minigame_rounds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id::text AS id`,
        params,
      ),
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
  const params = [
    gameId,
    players.map((p) => p.accountId),
    players.map((p) => p.colorIndex),
    players.map((p) => p.isMidgameJoin),
  ];
  await withTeamCols(
    () =>
      query(
        `INSERT INTO game_players (game_id, account_id, color_index, is_midgame_join, team)
         SELECT $1::bigint, x.account_id, x.color_index, x.is_midgame_join, x.team
           FROM unnest($2::bigint[], $3::smallint[], $4::boolean[], $5::text[])
                AS x(account_id, color_index, is_midgame_join, team)
         ON CONFLICT (game_id, account_id) DO NOTHING`,
        [...params, players.map((p) => p.team ?? null)],
      ),
    () =>
      query(
        `INSERT INTO game_players (game_id, account_id, color_index, is_midgame_join)
         SELECT $1::bigint, x.account_id, x.color_index, x.is_midgame_join
           FROM unnest($2::bigint[], $3::smallint[], $4::boolean[])
                AS x(account_id, color_index, is_midgame_join)
         ON CONFLICT (game_id, account_id) DO NOTHING`,
        params,
      ),
  );
}

/**
 * ★★★ R079 (D-335) — 팀전 승리 보너스: 이긴 팀 전원에게 point_grants(reason 'team_win' · ref 'game' · game_id).
 *   ★ 멱등 — 부분 유일 인덱스 point_grants_team_win_uq(ref_type, ref_id, account_id) WHERE reason = 'team_win' (0030) 에 걸리면 넘어간다.
 *   ★ seenIds(결과 화면을 본 접속자)는 seen_at = now() — 결과 줄이 이미 알렸다. 끊긴 사람은 다음 로그인 때 GrantToast 가 띄운다.
 */
export async function grantTeamWin(input: {
  gameId: string;
  accountIds: readonly string[];
  amount: number;
  note: string;
  seenIds: readonly string[];
}): Promise<number> {
  if (!teamCols || input.amount <= 0 || input.accountIds.length === 0) return 0;
  const r = await query(
    `INSERT INTO point_grants (account_id, amount, reason, ref_type, ref_id, note, seen_at)
     SELECT x.account_id, $2, 'team_win', 'game', $1::bigint, $3,
            CASE WHEN x.account_id = ANY($5::bigint[]) THEN now() ELSE NULL END
       FROM unnest($4::bigint[]) AS x(account_id)
     ON CONFLICT (ref_type, ref_id, account_id) WHERE reason = 'team_win' DO NOTHING`,
    [input.gameId, input.amount, input.note.slice(0, 200), input.accountIds, input.seenIds],
  );
  return r.rowCount ?? 0;
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
