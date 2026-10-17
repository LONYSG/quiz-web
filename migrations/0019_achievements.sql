-- =============================================================================
-- 0019. ★★ 업적 (R054 / D-243) — 표 추가만
--
-- ★ 찬종: "플레이 기록은 다양하게 보존해두자." · 설계 판단(2026-10-17): 업적은 **표시만**(포인트 · 꾸미기 보상 없음 — 17 2절).
-- ★ 정의는 코드 상수(shared/src/achievements.ts) · 판정은 기존 표(answer_events · minigame_* · account_emojis)로 — 이 표는 "언제 얻었나" 기록.
--   (account_id, key) UNIQUE — 같은 업적은 한 번만. 소급은 scripts/achievements-backfill.mjs(멱등).
-- =============================================================================

CREATE TABLE IF NOT EXISTS achievements (
  account_id  bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key         text        NOT NULL,
  earned_at   timestamptz NOT NULL DEFAULT now(),
  value       double precision,
  game_id     bigint      REFERENCES games(id) ON DELETE SET NULL,
  run_id      bigint      REFERENCES minigame_runs(id) ON DELETE SET NULL,
  backfilled  boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, key)
);
CREATE INDEX IF NOT EXISTS achievements_key_idx ON achievements (key);
