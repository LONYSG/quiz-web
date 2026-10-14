// =============================================================================
// ★★ 포인트 (R048 / D-229)
//
//   번 것 = answer_events.accepted 수(계정별 · 처음부터) · 쓴 것 = point_spends 합 · 잔액 = 차.
//   ★ 잔액 열을 두지 않는다 — 두 표에서 언제든 다시 센다(옛 기록도 그대로 인정 — 찬종 확정).
//   쓰기(spend)는 R049 뽑기가 쓴다. 잔액이 모자라면 실패(한 트랜잭션 안에서 다시 세어 확인).
// =============================================================================

import { query } from './pool.js';

export interface PointBalance {
  earned: number;
  spent: number;
  balance: number;
}

export async function getPoints(accountId: string): Promise<PointBalance> {
  const r = await query<{ earned: string; spent: string }>(
    `SELECT
       (SELECT count(*) FROM answer_events WHERE account_id = $1 AND accepted)::text AS earned,
       (SELECT coalesce(sum(amount), 0) FROM point_spends WHERE account_id = $1)::text AS spent`,
    [accountId],
  );
  const earned = Number(r.rows[0]?.earned ?? 0);
  const spent = Number(r.rows[0]?.spent ?? 0);
  return { earned, spent, balance: earned - spent };
}
