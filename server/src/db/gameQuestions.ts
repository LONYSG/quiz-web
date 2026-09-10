// =============================================================================
// 문제별 게임 기록 (Phase 3)
//   game_questions / answer_events / question_experiences
//
// ★★ 이 파일의 함수는 **전부 상태 전환이 끝난 뒤에** 호출된다 (04-PROTOCOL 1장).
//   ★ 판정 블록 안에서 부르면 안 된다. 그 블록에는 await 가 없어야 한다.
//   ★ 호출자는 결과를 기다리지 않는다(void). DB 쓰기 실패가 게임 진행을 막지 않는다.
//
// ★ 그래도 실패를 조용히 삼키지 않는다. 로그에 남긴다.
//   ★ 근거: answer_events 가 "프로세스가 죽어도 점수를 재구성할 수 있게" 하는 근거다
//     (0001_init.sql 주석). 조용히 빠지면 그 근거가 사라진 것을 아무도 모른다.
// =============================================================================

import { query } from './pool.js';
import type { AnswerRejectReason, QuestionResolution } from '@quiz/shared';

/** 문제 시작 기록. ★ gameId 가 null 이면 부르지 않는다 (호출자가 확인한다) */
export async function insertGameQuestion(input: {
  gameId: string;
  questionIndex: number;
  questionId: string;
  epoch: number;
  startedAt: number;
  selectionStage: number;
}): Promise<void> {
  await query(
    `INSERT INTO game_questions
       (game_id, question_index, question_id, epoch, started_at, selection_stage)
     VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6)
     ON CONFLICT (game_id, question_index) DO NOTHING`,
    [
      input.gameId,
      input.questionIndex,
      input.questionId,
      input.epoch,
      input.startedAt,
      input.selectionStage,
    ],
  );
}

/**
 * 문제 종료 기록.
 *
 * ★ 이미 기록된 것을 덮어쓰지 않는다 (resolved_at IS NULL 조건).
 *   ★ 근거: 같은 문제가 두 경로로 끝나는 일은 resolved 플래그가 막지만,
 *     방어를 한 겹 더 둔다. 나중 사유가 먼저 사유를 덮으면 기록이 왜곡된다.
 */
export async function resolveGameQuestion(input: {
  gameId: string;
  questionIndex: number;
  resolution: QuestionResolution;
  winnerAccountId: string | null;
  skipVotesAtEnd: number;
  activeAtEnd: number;
}): Promise<void> {
  await query(
    `UPDATE game_questions
        SET resolved_at = now(),
            resolution = $3,
            winner_account_id = $4,
            skip_votes_at_end = $5,
            active_at_end = $6
      WHERE game_id = $1 AND question_index = $2 AND resolved_at IS NULL`,
    [
      input.gameId,
      input.questionIndex,
      input.resolution,
      input.winnerAccountId,
      input.skipVotesAtEnd,
      input.activeAtEnd,
    ],
  );
}

/**
 * 정답 문자열과 일치한 메시지 기록 (Q-52).
 *
 * ★★ 일반 오답 채팅은 저장하지 않는다.
 *   ★ guide 54절의 "미친 듯이 입력하는" 특성상 양이 많고,
 *     Q-09 에서 채팅 로그를 DB 에 저장하지 않기로 확정했다.
 * ★ accepted=false 인 것도 저장한다. guide 18절의 순서 추적 근거다.
 */
export async function insertAnswerEvent(input: {
  gameId: string;
  questionIndex: number;
  questionId: string;
  accountId: string;
  submittedSeq: number;
  responseMs: number;
  matched: boolean;
  wasEligible: boolean;
  accepted: boolean;
  rejectReason: AnswerRejectReason | null;
}): Promise<void> {
  await query(
    `INSERT INTO answer_events
       (game_id, question_index, question_id, account_id,
        submitted_seq, response_ms, matched, was_eligible, accepted, reject_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.gameId,
      input.questionIndex,
      input.questionId,
      input.accountId,
      input.submittedSeq,
      input.responseMs,
      input.matched,
      input.wasEligible,
      input.accepted,
      input.rejectReason,
    ],
  );
}

/**
 * ★★ 경험 기록 (Q-23/24/47 단일 기준).
 *
 *   > **정답이 공개되는 순간 그 자리에 있었던 사람 전원**
 *
 * ★ ON CONFLICT DO NOTHING 으로 "처음 경험한 시점" 을 보존한다.
 *   ★ 경험자도 그 문제를 다시 보게 되므로(판정에서만 제외됨) 덮어쓰면 정보가 손실된다.
 * ★ 절대 삭제하지 않는다. 강제 종료해도 과거 기록은 롤백되지 않는다 (guide 25·26절).
 * ★ 정답을 공개하지 않는 경로(강제 종료 / abandoned / server_restart)에서는
 *   이 함수를 부르지 않는다. 그것이 규칙의 구현이다.
 */
export async function recordExperiences(input: {
  accountIds: readonly string[];
  questionId: string;
  gameId: string | null;
}): Promise<number> {
  if (input.accountIds.length === 0) return 0;
  const r = await query(
    `INSERT INTO question_experiences (account_id, question_id, first_game_id)
     SELECT x.account_id, $2::bigint, $3::bigint
       FROM unnest($1::bigint[]) AS x(account_id)
     ON CONFLICT (account_id, question_id) DO NOTHING`,
    [input.accountIds, input.questionId, input.gameId],
  );
  return r.rowCount ?? 0;
}

/**
 * ★ 게임 종료 시 최종 점수를 한 번에 확정한다 (R003 4-3 확정).
 *
 * ★★ 진행 중에는 final_score 를 UPDATE 하지 않는다.
 *   ★ 근거: 점수는 answer_events 로부터 완전히 계산할 수 있다.
 *     문제마다 UPDATE 하면 같은 정보를 두 번 쓰는 것이 된다.
 */
export async function finalizeScores(
  gameId: string,
  scores: readonly { accountId: string; score: number; rank: number; connected: boolean }[],
): Promise<void> {
  if (scores.length === 0) return;
  await query(
    `UPDATE game_players gp
        SET final_score = x.score, final_rank = x.rank, connected_at_end = x.connected
       FROM unnest($2::bigint[], $3::int[], $4::int[], $5::boolean[])
            AS x(account_id, score, rank, connected)
      WHERE gp.game_id = $1 AND gp.account_id = x.account_id`,
    [
      gameId,
      scores.map((s) => s.accountId),
      scores.map((s) => s.score),
      scores.map((s) => s.rank),
      scores.map((s) => s.connected),
    ],
  );
}

/**
 * ★ 중간 참가자를 game_players 에 추가한다 (guide 32절).
 *
 * ★ is_midgame_join=true 로 넣는다. 결과 화면에서 구분할 수 있어야 한다.
 * ★ 이미 있으면 아무 일도 하지 않는다 — 재접속은 중간 참가가 아니다.
 */
export async function insertMidgamePlayer(input: {
  gameId: string;
  accountId: string;
  colorIndex: number;
}): Promise<void> {
  await query(
    `INSERT INTO game_players (game_id, account_id, color_index, is_midgame_join)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (game_id, account_id) DO NOTHING`,
    [input.gameId, input.accountId, input.colorIndex],
  );
}
