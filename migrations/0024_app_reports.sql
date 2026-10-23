-- =============================================================================
-- 0024. ★★ 앱 제보 app_reports (R061 / D-255 — 찬종 "어떤 화면이라도 문제점을 제보할 수 있는 창")
--
-- ★ 두 가지 제보가 한 표: ⓐ 문제 전용(📝 — kind 'question' + question_id · 사유 칩) ⓑ 전반적(🐞 — 버그 · 어색함 · 제안 · 기타).
-- ★ 담는 것: 찬종(사람)이 친 제보 글 + 자동 맥락(화면 · 방 · 판 · 문항 · 미니게임 · 기기 · 최근 소켓 이벤트 **이름**).
--   채팅 원문 · 다른 사람 글은 담지 않는다(01 9장).
-- ★ 문항 · 판 · 미니게임 판은 서버가 채운다(클라는 screen · index · key 만). 글의 "#2271" / "photo-0303" 도 서버가 붙인다.
-- ★ 읽기: npm run reports:report · 처리 표시: npm run reports:handle (handled_at · note "R062 반영").
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_reports (
  id               bigserial   PRIMARY KEY,
  account_id       bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  kind             text        NOT NULL CHECK (kind IN ('bug', 'awkward', 'idea', 'question', 'other')),
  text             text        NOT NULL CHECK (char_length(text) <= 500),
  reasons          text[]      NOT NULL DEFAULT '{}',
  screen           text        NOT NULL CHECK (char_length(screen) <= 60),
  room_id          text,
  game_id          bigint      REFERENCES games(id) ON DELETE SET NULL,
  question_id      bigint      REFERENCES questions(id) ON DELETE SET NULL,
  question_index   integer,
  minigame_key     text,
  minigame_run_id  bigint      REFERENCES minigame_runs(id) ON DELETE SET NULL,
  minigame_item    text,
  device           jsonb       NOT NULL DEFAULT '{}',
  recent           jsonb,
  handled_at       timestamptz,
  note             text        CHECK (note IS NULL OR char_length(note) <= 200)
);
CREATE INDEX IF NOT EXISTS app_reports_created_idx ON app_reports (created_at);
CREATE INDEX IF NOT EXISTS app_reports_handled_idx ON app_reports (handled_at);
