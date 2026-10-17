// =============================================================================
// ★★ 전적 (R054 · D-242) — 이미 보존된 표에서 **읽기만**(새로 세어 두는 표 없음 — 느리면 그때 요약 표)
//
//   퀴즈: 참여 판 수(game_players) · 맞힌 수(answer_events.accepted — 포인트 원천) · 분야 7 별 · 난이도 단계별 · 평균 반응 ms(matched)
//   미니게임: 게임별 판 수 · 최종 1위 횟수(minigame_players.final_rank = 1) · 최고 기록(minigame_results.value — 게임 방향대로) · 퀴즈류는 맞힌 비율
//   포인트: 맞힌 + 보상 − 쓴 것 = 지금(R048 식 그대로 — getPoints) · 최근 쓴 것 10
// ★ 연습 판(practice)은 세지 않는다.
// =============================================================================

import { DIFFICULTY_TIERS, GAME_TOPICS, MINIGAMES } from '@quiz/shared';
import { query } from './pool.js';
import { getPoints } from './points.js';

export interface Stats {
  quiz: { games: number; correct: number; byTopic: { topic: string; label: string; n: number }[]; byTier: { tier: string; label: string; n: number }[]; avgResponseMs: number | null };
  minigames: { key: string; name: string; runs: number; wins: number; best: number | null; unit: string; better: 'low' | 'high'; accuracy: number | null }[];
  points: Awaited<ReturnType<typeof getPoints>> & { recent: { amount: number; reason: string; at: string }[] };
}

export async function getStats(accountId: string): Promise<Stats> {
  const [games, correct, topics, tiers, resp, runs, best, spends, points] = await Promise.all([
    query<{ n: string }>(`SELECT count(DISTINCT game_id)::text n FROM game_players WHERE account_id = $1`, [accountId]),
    query<{ n: string }>(`SELECT count(*)::text n FROM answer_events WHERE account_id = $1 AND accepted`, [accountId]),
    query<{ game_topic: string; n: string }>(
      `SELECT t.game_topic, count(*)::text n FROM answer_events e JOIN questions q ON q.id = e.question_id JOIN category_game_topics t ON t.category_id = q.category_id
        WHERE e.account_id = $1 AND e.accepted AND t.game_topic IS NOT NULL GROUP BY t.game_topic`,
      [accountId],
    ),
    query<{ s: number; n: string }>(
      `SELECT q.difficulty_score s, count(*)::text n FROM answer_events e JOIN questions q ON q.id = e.question_id WHERE e.account_id = $1 AND e.accepted GROUP BY q.difficulty_score`,
      [accountId],
    ),
    query<{ ms: string | null }>(`SELECT round(avg(response_ms))::text ms FROM answer_events WHERE account_id = $1 AND matched`, [accountId]),
    query<{ k: string; runs: string; wins: string }>(
      `SELECT r.minigame_key k, count(*)::text runs, count(*) FILTER (WHERE p.final_rank = 1 AND (SELECT count(*) FROM minigame_players x WHERE x.run_id = r.id) >= 2)::text wins
         FROM minigame_players p JOIN minigame_runs r ON r.id = p.run_id WHERE p.account_id = $1 AND NOT r.practice GROUP BY r.minigame_key`,
      [accountId],
    ),
    query<{ k: string; mn: number | null; mx: number | null; total: string; got: string }>(
      `SELECT r.minigame_key k, min(res.value) FILTER (WHERE res.submitted) mn, max(res.value) FILTER (WHERE res.submitted) mx,
              count(*)::text total, count(*) FILTER (WHERE res.points > 0)::text got
         FROM minigame_results res JOIN minigame_runs r ON r.id = res.run_id WHERE res.account_id = $1 AND NOT r.practice GROUP BY r.minigame_key`,
      [accountId],
    ),
    query<{ amount: number; reason: string; created_at: Date }>(`SELECT amount, reason, created_at FROM point_spends WHERE account_id = $1 ORDER BY created_at DESC LIMIT 10`, [accountId]),
    getPoints(accountId),
  ]);
  const topicN = new Map(topics.rows.map((r) => [r.game_topic, Number(r.n)]));
  const tierN = (scores: readonly number[]) => tiers.rows.filter((r) => scores.includes(Number(r.s))).reduce((s, r) => s + Number(r.n), 0);
  const runMap = new Map(runs.rows.map((r) => [r.k, r]));
  const bestMap = new Map(best.rows.map((r) => [r.k, r]));
  return {
    quiz: {
      games: Number(games.rows[0]?.n ?? 0),
      correct: Number(correct.rows[0]?.n ?? 0),
      byTopic: GAME_TOPICS.map((t) => ({ topic: t.topic, label: t.label, n: topicN.get(t.topic) ?? 0 })),
      byTier: DIFFICULTY_TIERS.map((t) => ({ tier: t.tier, label: t.label, n: tierN(t.scores) })),
      avgResponseMs: resp.rows[0]?.ms ? Number(resp.rows[0].ms) : null,
    },
    minigames: MINIGAMES.map((m) => {
      const r = runMap.get(m.key);
      const b = bestMap.get(m.key);
      return {
        key: m.key,
        name: m.name,
        runs: Number(r?.runs ?? 0),
        wins: Number(r?.wins ?? 0),
        best: m.kind === 'quiz' || !b ? null : m.better === 'low' ? b.mn : b.mx,
        unit: m.unit,
        better: m.better,
        accuracy: m.kind === 'quiz' && b && Number(b.total) > 0 ? Number(b.got) / Number(b.total) : null,
      };
    }),
    points: { ...points, recent: spends.rows.map((s) => ({ amount: s.amount, reason: s.reason, at: s.created_at.toISOString() })) },
  };
}
