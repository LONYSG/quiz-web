-- =============================================================================
-- 0031. ★★★ 주제 세트 (R080 · D-330 · D-337 · docs/18 §9) — 여러 미니게임이 나눠 쓰는 공용 데이터(많이 말하기 · 겹치면 무효 · 뒤에 빙고 · 라이어 · 캐치마인드)
--
-- ① topic_sets  — 주제 하나(= data/minigame/topics/<slug>.json 머리). loaded_at = 마지막 적재 시각(파일 status 는 'loaded' 로 바꾸지 않는다 — §9)
-- ② topic_items — 항목(<slug>-NNN · 영구 id). 판정 = name + variants(퀴즈와 같은 정규화) · 화면 = label(없으면 name)
-- ★ 적재 = scripts/topics-load.mjs(파일 status 'verified' 만 · 같은 id 갱신 · 빠졌거나 verified 가 아니게 된 것 active=false — 지우지 않는다)
--   ops 메뉴 1 이 migrate · 빌드 뒤 자동으로 돌린다.
-- ★ 경험 기록은 표를 새로 만들지 않는다 — minigame_item_experiences(0017) 의 item_key 'topic:<slug>'(세트 단위).
-- ★ 추가만. 되돌리기: DROP TABLE IF EXISTS topic_items; DROP TABLE IF EXISTS topic_sets;
-- =============================================================================

CREATE TABLE IF NOT EXISTS topic_sets (
  topic       text        PRIMARY KEY,
  name_ko     text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('closed', 'open')),
  version     integer     NOT NULL DEFAULT 1,
  as_of       date,
  status      text        NOT NULL,
  liar        boolean     NOT NULL DEFAULT false,
  draw        boolean     NOT NULL DEFAULT false,
  time_sec    integer     NOT NULL DEFAULT 30,
  tags        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  count       integer     NOT NULL DEFAULT 0,
  source      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  verify      jsonb,
  loaded_at   timestamptz NOT NULL DEFAULT now(),
  active      boolean     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS topic_items (
  id          text        PRIMARY KEY,
  topic       text        NOT NULL REFERENCES topic_sets(topic) ON DELETE CASCADE,
  seq         integer     NOT NULL,
  name        text        NOT NULL,
  label       text,
  variants    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tags        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  year        integer,
  draw        boolean     NOT NULL DEFAULT false,
  liar        boolean     NOT NULL DEFAULT false,
  qid         integer,
  note        text,
  active      boolean     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS topic_items_topic_idx ON topic_items (topic, seq);
