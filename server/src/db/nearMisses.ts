// =============================================================================
// ★★ 근접 오답 기록 (R058 · A83 (나) · D-252 · 0022)
//
// ★ 판정이 **끝난 뒤** 호출자가 void 로 띄운다(판정 지연 0 — gameQuestions.ts 와 같은 규칙).
// ★ 봇 · 검사 계정은 SQL 에서 거른다(login_id 정규식) — 판정 경로에서 계정을 읽지 않으려고.
// ★ 보관 90일 — 서버 부팅 때만 지운다(주기 작업을 두지 않는다 — pool.ts (3)).
// =============================================================================

import { NEAR_MISS_KEEP_DAYS, type NearMissKind } from '@quiz/shared';
import { query } from './pool.js';

export async function insertNearMiss(input: {
  questionId: string;
  accountId: string;
  gameId: string;
  normalized: string;
  nearest: string;
  distance: number;
  kind: NearMissKind;
  skipLogin: string;
}): Promise<void> {
  await query(
    `INSERT INTO near_misses (question_id, account_id, game_id, normalized, nearest, distance, kind)
     SELECT $1, a.id, $3, $4, $5, $6, $7 FROM accounts a WHERE a.id = $2 AND a.login_id !~* $8`,
    [input.questionId, input.accountId, input.gameId, input.normalized, input.nearest, input.distance, input.kind, input.skipLogin],
  );
}

/** 보관 기한(90일)이 지난 행을 지운다 — bootCleanup */
export async function deleteOldNearMisses(): Promise<number> {
  const r = await query(`DELETE FROM near_misses WHERE created_at < now() - make_interval(days => $1)`, [NEAR_MISS_KEEP_DAYS]);
  return r.rowCount ?? 0;
}
