-- =============================================================================
-- 0032. ★★★ 방 방식 '라이어' (R082 · D-330 ⑵ ⑶ · D-339) — 더하기만
--
-- ① games.mode CHECK 에 'liar'(0021 의 'quiz' · 'minigame' 에 더함 — 옛 미니게임만 판은 0021 이 이미 'minigame')
-- ② liar_rounds — 라이어 판의 라운드 하나(docs/17 §3 "세밀하게"): 주제 · 제시어 · 라이어 · 설명 순서 · 한마디 · 단계별 투표 · 결과 · 키워드 맞히기 · 점수
-- ★ 경험 기록은 표를 새로 만들지 않는다 — minigame_item_experiences(minigame_key 'liar' · item_key = topic_items.id · run_id NULL)
-- ★ 되돌리기:
--   DROP TABLE IF EXISTS liar_rounds;
--   DELETE FROM games WHERE mode = 'liar';  (또는 남겨 두고) ALTER TABLE games DROP CONSTRAINT games_mode_check;
--   ALTER TABLE games ADD CONSTRAINT games_mode_check CHECK (mode IN ('quiz', 'minigame'));
-- =============================================================================

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_mode_check;
ALTER TABLE games ADD CONSTRAINT games_mode_check CHECK (mode IN ('quiz', 'minigame', 'liar'));

CREATE TABLE IF NOT EXISTS liar_rounds (
  id               bigserial   PRIMARY KEY,
  game_id          bigint      REFERENCES games(id) ON DELETE CASCADE,
  round            integer     NOT NULL,
  topic            text        NOT NULL,
  item_id          text        NOT NULL,
  keyword          text        NOT NULL,
  liar_account_id  bigint      REFERENCES accounts(id) ON DELETE SET NULL,
  participants     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  turn_order       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  says             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  votes            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  outcome          text        NOT NULL CHECK (outcome IN ('caught', 'escaped', 'notfound')),
  accused          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  keyword_guess    text,
  guess_ok         boolean,
  scores           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, round)
);
CREATE INDEX IF NOT EXISTS liar_rounds_game_idx ON liar_rounds (game_id);
