// =============================================================================
// ★★★ 캐치마인드 기록 (R083 · 0033 · D-340) — draw_rounds 한 그림 한 행 · 경험(minigame_item_experiences 'draw')
//   ★ 0033 없는 DB 에서는 실패를 로그로만(부르는 쪽 fire-and-forget) · 그림(선)은 저장하지 않는다
// =============================================================================

import { query } from './pool.js';

export async function insertDrawRound(r: {
  gameId: string | null;
  round: number;
  drawer: string;
  topic: string;
  itemId: string;
  keyword: string;
  rerolled: boolean;
  strokes: number;
  participants: string[];
  solved: { accountId: string; ms: number }[];
  outcome: 'all' | 'some' | 'none';
  scores: Record<string, number>;
  /** ★ R088 — 출제자 힌트 */
  hints?: Record<string, string>;
}): Promise<void> {
  if (!r.gameId) return;
  await query(
    `INSERT INTO draw_rounds (game_id, round, drawer_account_id, topic, item_id, keyword, rerolled, strokes_count, participants, solved, outcome, scores)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb)
     ON CONFLICT (game_id, round) DO NOTHING`,
    [r.gameId, r.round, r.drawer, r.topic, r.itemId, r.keyword, r.rerolled, r.strokes, JSON.stringify(r.participants), JSON.stringify(r.solved), r.outcome, JSON.stringify(r.scores)],
  );  // ★ R088 (0034) — R087 출제자 힌트 기록(따로 — 0034 전 DB 에서도 위 행은 남는다)
  if (r.hints && Object.keys(r.hints).length) await query(`UPDATE draw_rounds SET hints = $3::jsonb WHERE game_id = $1 AND round = $2`, [r.gameId, r.round, JSON.stringify(r.hints)]);

}

export async function recordDrawExperience(accountIds: readonly string[], itemId: string): Promise<void> {
  if (accountIds.length === 0) return;
  await query(
    `INSERT INTO minigame_item_experiences (account_id, minigame_key, item_key, run_id)
     SELECT a, 'draw', $2, NULL FROM unnest($1::bigint[]) AS a ON CONFLICT DO NOTHING`,
    [accountIds, itemId],
  );
}
