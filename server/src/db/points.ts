// =============================================================================
// ★★ 포인트 (R048 / D-229)
//
//   번 것 = answer_events.accepted 수(계정별 · 처음부터) · 쓴 것 = point_spends 합 · 잔액 = 차.
//   ★ 잔액 열을 두지 않는다 — 두 표에서 언제든 다시 센다(옛 기록도 그대로 인정 — 찬종 확정).
//   쓰기(spend)는 R049 뽑기가 쓴다. 잔액이 모자라면 실패(한 트랜잭션 안에서 다시 세어 확인).
// =============================================================================

import { query } from './pool.js';

export interface PointBalance {
  /** 번 것 = 맞힌 문제 + 미니게임 보상 */
  earned: number;
  /** ★ R050 — 번 것의 두 갈래 */
  correct: number;
  rewards: number;
  spent: number;
  balance: number;
}

/**
 * ★★ R050 (D-234) — 포인트 식 한 곳: 번 것 = answer_events.accepted 수 + minigame_rewards 합 · 쓴 것 = point_spends 합.
 *   `$1` = 계정 id. 열: correct · rewards · spent (text). 샵(잔액 · 뽑기 트랜잭션)과 /api/me/points 가 같은 식을 쓴다.
 */
export const POINTS_SQL = `SELECT
       (SELECT count(*) FROM answer_events WHERE account_id = $1 AND accepted)::text AS correct,
       (SELECT coalesce(sum(amount), 0) FROM minigame_rewards WHERE account_id = $1)::text AS rewards,
       (SELECT coalesce(sum(amount), 0) FROM point_spends WHERE account_id = $1)::text AS spent`;

export function pointsFromRow(row: { correct?: string; rewards?: string; spent?: string } | undefined): PointBalance {
  const correct = Number(row?.correct ?? 0);
  const rewards = Number(row?.rewards ?? 0);
  const spent = Number(row?.spent ?? 0);
  return { earned: correct + rewards, correct, rewards, spent, balance: correct + rewards - spent };
}

export async function getPoints(accountId: string): Promise<PointBalance> {
  const r = await query<{ correct: string; rewards: string; spent: string }>(POINTS_SQL, [accountId]);
  return pointsFromRow(r.rows[0]);
}
