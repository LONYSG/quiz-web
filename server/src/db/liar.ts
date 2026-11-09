// =============================================================================
// ★★★ 라이어 게임 기록 (R082 · 0032 · D-339) — liar_rounds 한 라운드 한 행 · 경험(minigame_item_experiences 'liar')
//   ★ 0032 없는 DB(표 · CHECK 없음)에서는 실패를 로그로만 — 게임은 그대로(부르는 쪽이 fire-and-forget)
// =============================================================================

import { query } from './pool.js';

export async function insertLiarRound(r: {
  gameId: string | null;
  round: number;
  topic: string;
  itemId: string;
  keyword: string;
  liar: string;
  participants: string[];
  order: string[];
  says: unknown[];
  votes: unknown[];
  outcome: string;
  accused: string[];
  guess: string | null;
  guessOk: boolean | null;
  scores: Record<string, number> | null;
  /** ★ R088 (0034) — 라이어 모드 · 바보형 단어 */
  mode?: 'basic' | 'fool';
  foolWord?: string | null;
}): Promise<void> {
  if (!r.gameId) return;
  await query(
    `INSERT INTO liar_rounds (game_id, round, topic, item_id, keyword, liar_account_id, participants, turn_order, says, votes, outcome, accused, keyword_guess, guess_ok, scores)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13, $14, $15::jsonb)
     ON CONFLICT (game_id, round) DO NOTHING`,
    [
      r.gameId,
      r.round,
      r.topic,
      r.itemId,
      r.keyword,
      r.liar,
      JSON.stringify(r.participants),
      JSON.stringify(r.order),
      JSON.stringify(r.says),
      JSON.stringify(r.votes),
      r.outcome,
      JSON.stringify(r.accused),
      r.guess,
      r.guessOk,
      JSON.stringify(r.scores ?? {}),
    ],
  );
  // ★ R088 — 0034 칸은 따로(0034 전 DB 에서도 위 행은 남는다 — 실패는 부르는 쪽 로그)
  if (r.mode && (r.mode !== 'basic' || r.foolWord)) await query(`UPDATE liar_rounds SET mode = $3, fool_word = $4 WHERE game_id = $1 AND round = $2`, [r.gameId, r.round, r.mode, r.foolWord ?? null]);
}

export async function recordLiarExperience(accountIds: readonly string[], itemId: string): Promise<void> {
  if (accountIds.length === 0) return;
  await query(
    `INSERT INTO minigame_item_experiences (account_id, minigame_key, item_key, run_id)
     SELECT a, 'liar', $2, NULL FROM unnest($1::bigint[]) AS a ON CONFLICT DO NOTHING`,
    [accountIds, itemId],
  );
}
