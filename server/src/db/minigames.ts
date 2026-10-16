// =============================================================================
// ★★★ 미니게임 기록 (R050 · 0017 — D-234)
//
// ★ 기록은 지우지 않는다 (docs/17 3절). 전부 fire-and-forget 으로 부르되 실패는 로그에 남긴다(engine.ts).
// ★★ 보상(minigame_rewards)은 돈이다 — (run_id, account_id) UNIQUE + ON CONFLICT DO NOTHING:
//   재접속 · 서버 재시작 · 중복 이벤트로 두 번 지급되지 않는다. 메모리 점수에도 한 번만 더한다(engine 의 rewarded 깃발).
// =============================================================================

import { query } from './pool.js';

export interface NewRun {
  gameId: string | null;
  roomId: string;
  key: string;
  practice: boolean;
  afterQuestionIndex: number | null;
  seed: number;
}

export async function insertRun(r: NewRun): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO minigame_runs (game_id, room_id, minigame_key, practice, after_question_index, seed)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
    [r.gameId, r.roomId, r.key, r.practice, r.afterQuestionIndex, r.seed],
  );
  return res.rows[0]!.id;
}

export async function insertRunPlayers(
  runId: string,
  players: readonly { accountId: string; device: string | null; colorIndex: number }[],
): Promise<void> {
  if (players.length === 0) return;
  await query(
    `INSERT INTO minigame_players (run_id, account_id, device, color_index)
     SELECT $1::bigint, x.a, x.d, x.c FROM unnest($2::bigint[], $3::text[], $4::smallint[]) AS x(a, d, c)
     ON CONFLICT DO NOTHING`,
    [runId, players.map((p) => p.accountId), players.map((p) => p.device), players.map((p) => p.colorIndex)],
  );
}

export async function insertRound(runId: string, roundIndex: number, itemKey: string, params: unknown, seed: number): Promise<void> {
  await query(
    `INSERT INTO minigame_rounds (run_id, round_index, item_key, params, seed) VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT DO NOTHING`,
    [runId, roundIndex, itemKey, JSON.stringify(params), seed],
  );
}

export interface ResultRow {
  accountId: string;
  submitted: boolean;
  input: unknown;
  value: number | null;
  error: number | null;
  elapsedMs: number | null;
  rank: number;
  points: number;
}

export async function insertResults(runId: string, roundIndex: number, rows: readonly ResultRow[]): Promise<void> {
  if (rows.length === 0) return;
  await query(
    `INSERT INTO minigame_results (run_id, round_index, account_id, submitted, input, value, error, elapsed_ms, rank, points)
     SELECT $1::bigint, $2::int, x.a, x.s, x.i::jsonb, x.v, x.e, x.m, x.r, x.p
       FROM unnest($3::bigint[], $4::boolean[], $5::text[], $6::float8[], $7::float8[], $8::int[], $9::smallint[], $10::int[])
            AS x(a, s, i, v, e, m, r, p)
     ON CONFLICT DO NOTHING`,
    [
      runId,
      roundIndex,
      rows.map((r) => r.accountId),
      rows.map((r) => r.submitted),
      rows.map((r) => (r.input === null || r.input === undefined ? null : JSON.stringify(r.input))),
      rows.map((r) => r.value),
      rows.map((r) => r.error),
      rows.map((r) => (r.elapsedMs === null ? null : Math.round(r.elapsedMs))),
      rows.map((r) => r.rank),
      rows.map((r) => r.points),
    ],
  );
}

export async function finishRun(
  runId: string,
  reason: 'completed' | 'force_ended' | 'abandoned' | 'server_restart',
  finals: readonly { accountId: string; rank: number; total: number; reward: number }[],
): Promise<void> {
  await query(`UPDATE minigame_runs SET ended_at = now(), end_reason = $2 WHERE id = $1 AND ended_at IS NULL`, [runId, reason]);
  if (finals.length === 0) return;
  await query(
    `UPDATE minigame_players p SET final_rank = x.r, total_points = x.t, reward = x.w
       FROM unnest($2::bigint[], $3::smallint[], $4::int[], $5::int[]) AS x(a, r, t, w)
      WHERE p.run_id = $1 AND p.account_id = x.a`,
    [runId, finals.map((f) => f.accountId), finals.map((f) => f.rank), finals.map((f) => f.total), finals.map((f) => f.reward)],
  );
}

/** ★★ 보상 — 같은 (판, 계정) 은 한 번만. 넣은 행 수를 돌려준다 */
export async function insertRewards(runId: string, rewards: readonly { accountId: string; amount: number; rank: number }[]): Promise<number> {
  const rows = rewards.filter((r) => r.amount > 0);
  if (rows.length === 0) return 0;
  const res = await query(
    `INSERT INTO minigame_rewards (run_id, account_id, amount, rank)
     SELECT $1::bigint, x.a, x.m, x.r FROM unnest($2::bigint[], $3::int[], $4::smallint[]) AS x(a, m, r)
     ON CONFLICT (run_id, account_id) DO NOTHING`,
    [runId, rows.map((r) => r.accountId), rows.map((r) => r.amount), rows.map((r) => r.rank)],
  );
  return res.rowCount ?? 0;
}

/** ★ 퀴즈류 미니게임(R052~)의 경험 — 공개 순간 그 자리에 있던 사람에게. 이번 두 게임은 부르지 않는다(틀) */
export async function recordItemExperiences(accountIds: readonly string[], key: string, itemKey: string, runId: string): Promise<void> {
  if (accountIds.length === 0) return;
  await query(
    `INSERT INTO minigame_item_experiences (account_id, minigame_key, item_key, run_id)
     SELECT a, $2, $3, $4::bigint FROM unnest($1::bigint[]) AS a ON CONFLICT DO NOTHING`,
    [accountIds, key, itemKey, runId],
  );
}

export async function loadItemExperiences(accountIds: readonly string[], key: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (accountIds.length === 0) return out;
  const r = await query<{ account_id: string; item_key: string }>(
    `SELECT account_id::text, item_key FROM minigame_item_experiences WHERE minigame_key = $2 AND account_id = ANY($1::bigint[])`,
    [accountIds, key],
  );
  for (const row of r.rows) {
    let s = out.get(row.account_id);
    if (!s) out.set(row.account_id, (s = new Set()));
    s.add(row.item_key);
  }
  return out;
}

/** 서버가 재시작되면 끝나지 않은 판을 닫는다 (bootCleanup) */
export async function closeOpenRuns(): Promise<number> {
  const r = await query(`UPDATE minigame_runs SET ended_at = now(), end_reason = 'server_restart' WHERE ended_at IS NULL`);
  return r.rowCount ?? 0;
}

/** 게임 시작 때 참가자의 기기 종류 (game_players.device) */
export async function setGamePlayerDevices(gameId: string, devices: readonly { accountId: string; device: string | null }[]): Promise<void> {
  const rows = devices.filter((d) => d.device);
  if (rows.length === 0) return;
  await query(
    `UPDATE game_players g SET device = x.d FROM unnest($2::bigint[], $3::text[]) AS x(a, d) WHERE g.game_id = $1 AND g.account_id = x.a`,
    [gameId, rows.map((d) => d.accountId), rows.map((d) => d.device)],
  );
}
