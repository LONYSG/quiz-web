-- =============================================================================
-- 0033. ★★★ 방 방식 '캐치마인드' (R083 · D-330 ⑵ · D-340) — 더하기만
--
-- ① games.mode CHECK 에 'draw'
-- ② draw_rounds — 캐치마인드 판의 그림 하나(출제자 · 주제 · 제시어 · 선 수 · 맞힌 사람과 걸린 ms · 결과 · 점수)
--    ★ 그림 자체(선 좌표)는 저장하지 않는다(1차 — 크기 · 쓸 곳이 아직 없다)
-- ★ 경험: minigame_item_experiences(minigame_key 'draw' · item_key = topic_items.id · run_id NULL)
-- ★ 되돌리기:
--   DROP TABLE IF EXISTS draw_rounds;
--   ALTER TABLE games DROP CONSTRAINT games_mode_check;
--   ALTER TABLE games ADD CONSTRAINT games_mode_check CHECK (mode IN ('quiz', 'minigame', 'liar'));
-- =============================================================================

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_mode_check;
ALTER TABLE games ADD CONSTRAINT games_mode_check CHECK (mode IN ('quiz', 'minigame', 'liar', 'draw'));

CREATE TABLE IF NOT EXISTS draw_rounds (
  id                 bigserial   PRIMARY KEY,
  game_id            bigint      REFERENCES games(id) ON DELETE CASCADE,
  round              integer     NOT NULL,
  drawer_account_id  bigint      REFERENCES accounts(id) ON DELETE SET NULL,
  topic              text        NOT NULL,
  item_id            text        NOT NULL,
  keyword            text        NOT NULL,
  rerolled           boolean     NOT NULL DEFAULT false,
  strokes_count      integer     NOT NULL DEFAULT 0,
  participants       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  solved             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  outcome            text        NOT NULL CHECK (outcome IN ('all', 'some', 'none')),
  scores             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, round)
);
CREATE INDEX IF NOT EXISTS draw_rounds_game_idx ON draw_rounds (game_id);
