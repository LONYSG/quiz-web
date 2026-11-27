// =============================================================================
// ★★ 포인트 (R048 / D-229)
//
//   번 것 = answer_events.accepted 수(계정별 · 처음부터) · 쓴 것 = point_spends 합 · 잔액 = 차.
//   ★ R059 (D-254) — 번 것에 point_grants 합(제보 채택 · 월 최다 · 수동 지급)이 더해진다.
//   ★ 잔액 열을 두지 않는다 — 두 표에서 언제든 다시 센다(옛 기록도 그대로 인정 — 찬종 확정).
//   쓰기(spend)는 R049 뽑기가 쓴다. 잔액이 모자라면 실패(한 트랜잭션 안에서 다시 세어 확인).
// =============================================================================

import { getPool, query } from './pool.js';

export interface PointBalance {
  /** 번 것 = 맞힌 문제 + 미니게임 보상 */
  earned: number;
  /** ★ R050 — 번 것의 두 갈래 */
  correct: number;
  rewards: number;
  /** ★ R059 — 지급(point_grants — 제보 채택 · 수동) */
  grants: number;
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
       (SELECT coalesce(sum(amount), 0) FROM point_grants WHERE account_id = $1)::text AS grants,
       (SELECT coalesce(sum(amount), 0) FROM point_spends WHERE account_id = $1)::text AS spent`;

export function pointsFromRow(row: { correct?: string; rewards?: string; grants?: string; spent?: string } | undefined): PointBalance {
  const correct = Number(row?.correct ?? 0);
  const rewards = Number(row?.rewards ?? 0);
  const grants = Number(row?.grants ?? 0);
  const spent = Number(row?.spent ?? 0);
  return { earned: correct + rewards + grants, correct, rewards, grants, spent, balance: correct + rewards + grants - spent };
}

export async function getPoints(accountId: string): Promise<PointBalance> {
  const r = await query<{ correct: string; rewards: string; grants: string; spent: string }>(POINTS_SQL, [accountId]);
  return pointsFromRow(r.rows[0]);
}

/**
 * ★★ R123 — 포인트 쓰기 한 곳(캐치마인드 다른 제시어 · 혼자 하기 아이템) — 뽑기(shopRoutes)와 같은 꼴:
 *   계정 행 잠금 → 잔액 다시 세기 → 모자라면 거절 → point_spends 한 줄 → COMMIT. stillOk 가 false 면(기다리는 사이 판이 바뀜) 되돌린다.
 */
export async function spendPoints(
  accountId: string,
  amount: number,
  reason: string,
  ref: string | null,
  stillOk: () => boolean = () => true,
): Promise<{ ok: true; balance: number; spendId: string } | { ok: false; reason: 'insufficient' | 'stale' | 'error'; balance: number }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [accountId]);
    const bal = await client.query<{ correct: string; rewards: string; grants: string; spent: string }>(POINTS_SQL, [accountId]);
    const balance = pointsFromRow(bal.rows[0]).balance;
    if (balance < amount) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'insufficient', balance };
    }
    const row = await client.query<{ id: string }>(`INSERT INTO point_spends (account_id, amount, reason, ref) VALUES ($1, $2, $3, $4) RETURNING id::text`, [accountId, amount, reason, ref]);
    if (!stillOk()) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'stale', balance };
    }
    await client.query('COMMIT');
    return { ok: true, balance: balance - amount, spendId: row.rows[0]!.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[points] 쓰기 실패:', (err as Error).message);
    return { ok: false, reason: 'error', balance: 0 };
  } finally {
    client.release();
  }
}

/** ★ R123 — 쓴 줄 고치기(혼자 하기 안 쓴 아이템 돌려주기 · 실패한 다른 제시어) — 0 이면 줄을 지운다 */
export async function setSpendAmount(spendId: string, amount: number): Promise<void> {
  if (amount <= 0) await query(`DELETE FROM point_spends WHERE id = $1`, [spendId]);
  else await query(`UPDATE point_spends SET amount = $2 WHERE id = $1`, [spendId, amount]);
}

/** ★ R123 — 쓴 줄에 무엇에 썼는지 붙이기(혼자 하기 판 id — 판 줄을 만든 뒤에야 안다) */
export async function setSpendRef(spendId: string, ref: string): Promise<void> {
  await query(`UPDATE point_spends SET ref = $2 WHERE id = $1`, [spendId, ref]);
}
