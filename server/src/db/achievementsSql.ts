// =============================================================================
// ★★ 업적 판정 SQL (R054 · D-243) — 서버(실시간)와 소급 스크립트(scripts/achievements-backfill.mjs)가 같은 글을 쓴다
//
// ★ $1 = 계정 id 배열. 결과 행: account_id · key · earned_at · value · game_id · run_id — 조건을 만족한 **처음** 시각.
// ★ 정의 · 이름은 shared/src/achievements.ts. 여기 키가 바뀌면 거기도.
//   - 첫 정답: answer_events.accepted 의 첫 행
//   - 연속 정답 3 · 5 · 10: 한 판(game) 안 accepted 문제 번호가 끊기지 않은 구간(gaps and islands)
//   - 분야 10 · 50: accepted × questions.category_id × category_game_topics
//   - 미니게임 1위 1 · 10: minigame_players.final_rank = 1 · 연습 아님 · 참가 2명 이상
//   - 케이크 ≤ 0.05초 · 원 ≥ 95% · 번개손 < 200ms · 타자 ≤ 10초(완성): minigame_results.value · 연습 아님 · 제출
//   - 테마 완성: account_emojis 가 그 테마의 활성 이모티콘을 모두
// ★ 이 파일은 DB 연결을 import 하지 않는다(소급 스크립트가 dist 를 그대로 import 한다).
// =============================================================================

export const ACHIEVEMENTS_SQL = `
WITH acc AS (SELECT unnest($1::bigint[]) AS account_id),
ok AS (
  SELECT e.account_id, e.game_id, e.question_index, e.question_id, e.received_at
    FROM answer_events e JOIN acc USING (account_id) WHERE e.accepted
),
first_correct AS (
  SELECT DISTINCT ON (account_id) account_id, 'first-correct'::text AS key, received_at AS earned_at, NULL::float8 AS value, game_id, NULL::bigint AS run_id
    FROM ok ORDER BY account_id, received_at
),
isl AS (
  SELECT account_id, game_id, received_at, question_index - row_number() OVER (PARTITION BY account_id, game_id ORDER BY question_index) AS grp
    FROM (SELECT DISTINCT ON (account_id, game_id, question_index) * FROM ok ORDER BY account_id, game_id, question_index, received_at) d
),
isl2 AS (
  SELECT account_id, game_id, received_at, row_number() OVER (PARTITION BY account_id, game_id, grp ORDER BY received_at) AS n FROM isl
),
streak AS (
  SELECT DISTINCT ON (account_id, key) account_id, key, received_at AS earned_at, n::float8 AS value, game_id, NULL::bigint AS run_id
    FROM (SELECT i.*, 'streak-' || t.n AS key FROM isl2 i JOIN (VALUES (3), (5), (10)) t(n) ON i.n = t.n) x
   ORDER BY account_id, key, received_at
),
topic AS (
  SELECT o.account_id, o.game_id, o.received_at, t.game_topic,
         row_number() OVER (PARTITION BY o.account_id, t.game_topic ORDER BY o.received_at) AS n
    FROM ok o JOIN questions q ON q.id = o.question_id JOIN category_game_topics t ON t.category_id = q.category_id
   WHERE t.game_topic IS NOT NULL
),
topic_ach AS (
  SELECT account_id, 'topic-' || game_topic || '-' || n AS key, received_at AS earned_at, n::float8 AS value, game_id, NULL::bigint AS run_id
    FROM topic WHERE n IN (10, 50)
),
wins AS (
  SELECT p.account_id, r.id AS run_id, r.game_id, coalesce(r.ended_at, r.started_at) AS at,
         row_number() OVER (PARTITION BY p.account_id ORDER BY coalesce(r.ended_at, r.started_at), r.id) AS n
    FROM minigame_players p JOIN acc USING (account_id) JOIN minigame_runs r ON r.id = p.run_id
   WHERE p.final_rank = 1 AND NOT r.practice AND (SELECT count(*) FROM minigame_players x WHERE x.run_id = r.id) >= 2
),
win_ach AS (
  SELECT account_id, 'mg-win-' || n AS key, at AS earned_at, n::float8 AS value, game_id, run_id FROM wins WHERE n IN (1, 10)
),
mg AS (
  SELECT res.account_id, r.minigame_key, res.value, r.id AS run_id, r.game_id, coalesce(r.ended_at, r.started_at) AS at
    FROM minigame_results res JOIN acc USING (account_id) JOIN minigame_runs r ON r.id = res.run_id
   WHERE NOT r.practice AND res.value IS NOT NULL AND res.submitted
),
mg_ach AS (
  SELECT DISTINCT ON (account_id, key) account_id, key, at AS earned_at, value, game_id, run_id FROM (
    SELECT *, 'cake-50ms' AS key FROM mg WHERE minigame_key = 'cake' AND value <= 0.05
    UNION ALL SELECT *, 'circle-95' FROM mg WHERE minigame_key = 'circle' AND value >= 95
    UNION ALL SELECT *, 'reaction-200' FROM mg WHERE minigame_key = 'reaction' AND value < 200
    UNION ALL SELECT *, 'typing-10s' FROM mg WHERE minigame_key = 'typing' AND value <= 10
  ) x ORDER BY account_id, key, at
),
theme AS (
  SELECT ae.account_id, 'theme-' || th.key AS key, max(ae.obtained_at) AS earned_at, count(*)::float8 AS value, NULL::bigint AS game_id, NULL::bigint AS run_id
    FROM account_emojis ae JOIN acc USING (account_id) JOIN emojis em ON em.id = ae.emoji_id JOIN emoji_themes th ON th.id = em.theme_id
   WHERE em.active
   GROUP BY ae.account_id, th.key, th.id
  HAVING count(*) >= (SELECT count(*) FROM emojis e2 WHERE e2.theme_id = th.id AND e2.active)
)
SELECT * FROM first_correct UNION ALL SELECT * FROM streak UNION ALL SELECT * FROM topic_ach
UNION ALL SELECT * FROM win_ach UNION ALL SELECT * FROM mg_ach UNION ALL SELECT * FROM theme
`;

/** 판정 + 넣기 — 새로 얻은 것만 돌려준다(이미 있으면 그대로) */
export const AWARD_SQL = `
INSERT INTO achievements (account_id, key, earned_at, value, game_id, run_id, backfilled)
SELECT account_id, key, earned_at, value, game_id, run_id, $2::boolean FROM (${ACHIEVEMENTS_SQL}) a
ON CONFLICT (account_id, key) DO NOTHING
RETURNING account_id::text, key
`;
