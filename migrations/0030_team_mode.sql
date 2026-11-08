-- =============================================================================
-- 0030. ★★★ 팀전 1차 (R079 · D-329 · D-335 — 찬종 2026-11-08 "블루팀 / 레드팀 · 각 팀의 점수를 합쳐서 표기만")
--
-- ① games.team_mode — 팀전 판이었나 (기본 false · 옛 판 전부 false)
-- ② game_players.team — 'blue' | 'red' | null (팀전이 아닌 판 · 옛 행 null)
-- ③ point_grants reason 'team_win' · ref_type 'game' — 이긴 팀 전원 보너스 clamp(ceil(팀 점수/4), 1, 5)P (ref_id = games.id)
--    잔액 식(POINTS_SQL)은 이미 point_grants 합을 더한다 — 바꿀 것 없음.
-- ④ 부분 유일 인덱스 — 한 판 한 사람 한 번(같은 판을 두 번 끝내도 1행 · INSERT … ON CONFLICT DO NOTHING)
-- ★ 추가만. 되돌리기:
--   DROP INDEX IF EXISTS point_grants_team_win_uq; DELETE FROM point_grants WHERE reason = 'team_win';
--   (reason · ref_type CHECK 를 0026 꼴로 되돌림) · ALTER TABLE game_players DROP COLUMN team; ALTER TABLE games DROP COLUMN team_mode;
-- =============================================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS team_mode boolean NOT NULL DEFAULT false;

ALTER TABLE game_players ADD COLUMN IF NOT EXISTS team text;
ALTER TABLE game_players DROP CONSTRAINT IF EXISTS game_players_team_check;
ALTER TABLE game_players ADD CONSTRAINT game_players_team_check CHECK (team IS NULL OR team IN ('blue', 'red'));

ALTER TABLE point_grants DROP CONSTRAINT IF EXISTS point_grants_reason_check;
ALTER TABLE point_grants ADD CONSTRAINT point_grants_reason_check
  CHECK (reason IN ('feedback_adopted', 'feedback_monthly_top', 'admin', 'signup', 'rate', 'team_win'));

ALTER TABLE point_grants DROP CONSTRAINT IF EXISTS point_grants_ref_type_check;
ALTER TABLE point_grants ADD CONSTRAINT point_grants_ref_type_check
  CHECK (ref_type IN ('question_feedback', 'game'));

CREATE UNIQUE INDEX IF NOT EXISTS point_grants_team_win_uq
  ON point_grants (ref_type, ref_id, account_id) WHERE reason = 'team_win';
