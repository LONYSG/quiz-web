-- =============================================================================
-- 0016. ★ 포인트 · 특별 이모티콘 테마 (R048 / D-229 · D-230) — 표·열 추가만 (questions 는 건드리지 않는다)
--
-- ★★ 포인트 (찬종: "여태 맞힌 문제수 = 1 point 로 해서 돈처럼 쓸 수 있게")
--   번 포인트 = answer_events 에서 accepted = true 인 수 (계정별 · 2026-09-10 처음부터 전부 — 별도 열 없음, 늘 다시 셀 수 있다).
--   쓴 포인트 = point_spends 의 합. 잔액 = 번 것 − 쓴 것 (잔액 열을 두지 않는다 — 두 표에서 언제든 재구성).
--   reason: 'gacha'(뽑기 — R049) 등. ref: 무엇에 썼나(이모티콘 id 등).
--
-- ★★ 특별 이모티콘 (찬종: "테마는 선택할 수 있지만 원하는 gif 를 고를 수는 없어. 무작위 뽑기")
--   emoji_themes   — 테마(치이카와 …). price = 뽑기 한 번 값(포인트). key 는 assets/emoji/<key>/ 폴더 이름과 같다.
--   emojis.theme_id — 특별 이모티콘은 kind='custom' · category='special' · theme_id 있음. 그림은 0013 처럼 DB 에(≤1MB · 256px 이하로 줄여 넣는다).
--   emojis.source_name — 가져온 파일명(테마 안에서 유일 — 다시 가져올 때 건너뛰기용).
--   account_emojis — 누가 어떤 특별 이모티콘을 가졌나. ★ theme_id 가 있는 이모티콘은 가진 사람만 보낼 수 있다(서버 emoji.send 가 막는다).
-- =============================================================================

CREATE TABLE IF NOT EXISTS point_spends (
  id         bigserial   PRIMARY KEY,
  account_id bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount     integer     NOT NULL CHECK (amount > 0),
  reason     text        NOT NULL,
  ref        text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_spends_account_idx ON point_spends (account_id);

CREATE TABLE IF NOT EXISTS emoji_themes (
  id         serial      PRIMARY KEY,
  key        text        NOT NULL UNIQUE,
  name_ko    text        NOT NULL,
  price      integer     NOT NULL CHECK (price > 0),
  sort_order integer     NOT NULL DEFAULT 0,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emojis ADD COLUMN IF NOT EXISTS theme_id integer REFERENCES emoji_themes(id);
ALTER TABLE emojis ADD COLUMN IF NOT EXISTS source_name text;
CREATE INDEX IF NOT EXISTS emojis_theme_idx ON emojis (theme_id) WHERE theme_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS emojis_theme_source_idx ON emojis (theme_id, source_name) WHERE theme_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_emojis (
  account_id  bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  emoji_id    integer     NOT NULL REFERENCES emojis(id) ON DELETE CASCADE,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, emoji_id)
);
