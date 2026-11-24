// =============================================================================
// ★★★ R118 (docs/24 4-6 · 5-3 · 5-5 · 12-2) — 솔로 기록 · 띠 · 띠 포인트(0041)
//
//   ★ 판정 블록에서 부르지 않는다. 판 시작(판 줄 하나 · 최근 200) · 판 끝(최고 기록 · 띠 · 포인트 한 트랜잭션)은 기다리고,
//     문제마다 답 줄은 기다리지 않는다(서버가 꺼져도 그때까지가 남는다).
//   ★ question_experiences 를 읽지도 쓰지도 않는다 — 솔로에서 본 문제는 공방의 "본 문제"가 아니다(찬종).
//   ★ 솔로 판 자체로는 포인트가 없다(answer_events 를 안 쓴다) · 띠 · 단계가 오를 때만 차액을 point_grants('belt')로.
// =============================================================================

import { BELT_VERSION, SOLO, SOLO_RAMP_VERSION, beltPointsDue, nextBeltStep, type SoloEndReason, type SoloQuestionEnd } from '@quiz/shared';
import { getPool, query } from '../db/pool.js';

export async function insertSoloRun(a: { accountId: string; device: string | null; site: string | null; skipLogin: string; belt: boolean }): Promise<string> {
  const r = await query<{ id: string }>(
    `INSERT INTO solo_runs (account_id, device, site, ramp_version, belt_version, is_bot)
     SELECT a.id, $2, $3, $4, $5, a.login_id ~* $6 FROM accounts a WHERE a.id = $1
     RETURNING id::text`,
    [a.accountId, a.device, a.site, SOLO_RAMP_VERSION, a.belt ? BELT_VERSION : null, a.skipLogin],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('solo_runs INSERT — 계정 없음');
  return id;
}

/** 내가 최근 솔로에서 본 문항(새것부터 SOLO.RECENT_SKIP 개) */
export async function recentSoloQuestionIds(accountId: string): Promise<Set<string>> {
  const r = await query<{ question_id: string }>(
    `SELECT sa.question_id::text AS question_id
       FROM solo_answers sa JOIN solo_runs sr ON sr.id = sa.run_id
      WHERE sr.account_id = $1
      ORDER BY sa.shown_at DESC
      LIMIT $2`,
    [accountId, SOLO.RECENT_SKIP],
  );
  return new Set(r.rows.map((x) => x.question_id));
}

export interface SoloAnswerRow {
  runId: string;
  n: number;
  questionId: string;
  grade: number;
  textHash: string;
  shownAt: number;
  limitMs: number;
  correct: boolean;
  end: SoloQuestionEnd | 'quit' | 'disconnect';
  ms: number | null;
  firstMs: number | null;
  wrongCount: number;
  wrongTexts: string[];
  away: boolean;
}

export async function insertSoloAnswer(a: SoloAnswerRow): Promise<void> {
  await query(
    `INSERT INTO solo_answers (run_id, n, question_id, grade, text_hash, shown_at, limit_ms, correct, "end", ms, first_ms, wrong_count, wrong_texts, away)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (run_id, n) DO NOTHING`,
    [a.runId, a.n, a.questionId, a.grade, a.textHash, a.shownAt, a.limitMs, a.correct, a.end, a.ms, a.firstMs, Math.min(a.wrongCount, 32767), a.wrongTexts.length ? a.wrongTexts : null, a.away],
  );
}

export interface SoloFinish {
  best: number;
  bestBefore: number;
  beltBefore: number | null;
  beltAfter: number | null;
  points: number;
}

/**
 * 판 끝 — 판 줄 닫기 · 최고 기록 · (BELT) 띠 칸 · 띠 포인트 차액을 한 트랜잭션으로.
 *   ★ 띠는 내려가지 않는다(nextBeltStep) · 포인트는 칸이 오를 때만 · "받은 것" = point_grants 'belt' 합(따로 열 없음 · 5-5).
 *   ★ 화면이 끝 화면에서 "+40P" 를 보여 주므로 지급 줄은 seen_at = now()(로그인 토스트가 한 번 더 띄우지 않게).
 */
export async function finishSoloRun(a: {
  runId: string;
  accountId: string;
  correct: number;
  asked: number;
  reason: SoloEndReason;
  flags: Record<string, unknown>;
  belt: boolean;
}): Promise<SoloFinish> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const acc = await client.query<{ solo_best: number; belt_step: number | null }>(`SELECT solo_best, belt_step FROM accounts WHERE id = $1 FOR UPDATE`, [a.accountId]);
    const bestBefore = Number(acc.rows[0]?.solo_best ?? 0);
    const beltBefore = acc.rows[0]?.belt_step ?? null;
    const best = Math.max(bestBefore, a.correct);
    let beltAfter: number | null = beltBefore;
    let points = 0;
    if (a.belt) {
      beltAfter = nextBeltStep(beltBefore, best);
      if (beltBefore === null || beltAfter > beltBefore) {
        const g = await client.query<{ s: string }>(`SELECT coalesce(sum(amount), 0)::text AS s FROM point_grants WHERE account_id = $1 AND reason = 'belt'`, [a.accountId]);
        points = beltPointsDue(beltAfter, Number(g.rows[0]?.s ?? 0));
        if (points > 0) {
          await client.query(
            `INSERT INTO point_grants (account_id, amount, reason, ref_type, ref_id, note, seen_at) VALUES ($1, $2, 'belt', 'solo_run', $3, $4, now())`,
            [a.accountId, points, a.runId, `띠 칸 ${beltBefore ?? '-'} → ${beltAfter}`],
          );
        }
      }
    }
    await client.query(
      `UPDATE accounts SET solo_best = $2, belt_step = $3, belt_at = CASE WHEN $3::smallint IS DISTINCT FROM belt_step THEN now() ELSE belt_at END WHERE id = $1`,
      [a.accountId, best, beltAfter],
    );
    await client.query(
      `UPDATE solo_runs SET ended_at = now(), correct = $2, asked = $3, end_reason = $4, flags = $5::jsonb, best_before = $6, belt_before = $7, belt_after = $8 WHERE id = $1`,
      [a.runId, a.correct, a.asked, a.reason, JSON.stringify(a.flags), bestBefore, beltBefore, a.belt ? beltAfter : null],
    );
    await client.query('COMMIT');
    return { best, bestBefore, beltBefore, beltAfter, points };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface SoloMeRow {
  best: number;
  runs: number;
  belt: number | null;
}

export async function readSoloMe(accountId: string): Promise<SoloMeRow> {
  const r = await query<{ solo_best: number; belt_step: number | null; runs: string }>(
    `SELECT a.solo_best, a.belt_step, (SELECT count(*) FROM solo_runs WHERE account_id = a.id AND ended_at IS NOT NULL)::text AS runs FROM accounts a WHERE a.id = $1`,
    [accountId],
  );
  const row = r.rows[0];
  return { best: Number(row?.solo_best ?? 0), runs: Number(row?.runs ?? 0), belt: row?.belt_step ?? null };
}

/** 띠 칸(세션 · 사람 카드) — 열이 없으면(0041 전) null */
export async function readBeltSteps(accountIds: readonly string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (accountIds.length === 0) return out;
  try {
    const r = await query<{ id: string; belt_step: number | null }>(`SELECT id::text, belt_step FROM accounts WHERE id = ANY($1::bigint[])`, [accountIds]);
    for (const x of r.rows) out.set(x.id, x.belt_step ?? null);
  } catch {
    /* 0041 전 — 띠 없음 */
  }
  return out;
}

/** 사람 카드 — 띠 · 최고 기록 · 받은 때 */
export async function readBeltCard(accountId: string): Promise<{ belt: number | null; best: number; at: string | null } | null> {
  try {
    const r = await query<{ belt_step: number | null; solo_best: number; belt_at: Date | null }>(`SELECT belt_step, solo_best, belt_at FROM accounts WHERE id = $1`, [accountId]);
    const x = r.rows[0];
    if (!x) return null;
    return { belt: x.belt_step ?? null, best: Number(x.solo_best ?? 0), at: x.belt_at ? x.belt_at.toISOString() : null };
  } catch {
    return null;
  }
}

/** 부팅 정리 — 열린 솔로 판 닫기(그 판의 기록은 최고 기록 · 띠에 넣지 않는다 — server_restart) · 틀린 답 글 90일 */
export async function closeOpenSoloRuns(): Promise<number> {
  try {
    const r = await query(
      `UPDATE solo_runs s SET ended_at = now(), end_reason = 'server_restart',
              correct = coalesce((SELECT count(*) FROM solo_answers a WHERE a.run_id = s.id AND a.correct), 0),
              asked = coalesce((SELECT count(*) FROM solo_answers a WHERE a.run_id = s.id), 0)
        WHERE ended_at IS NULL`,
    );
    await query(`UPDATE solo_answers SET wrong_texts = NULL WHERE wrong_texts IS NOT NULL AND created_at < now() - interval '90 days'`);
    return r.rowCount ?? 0;
  } catch {
    return 0;
  }
}
