-- =============================================================================
-- 0018. ★★★ 퀴즈류 미니게임 항목 · 그림 · 품목 (R052 / D-239) — 표 추가만 (questions 는 건드리지 않는다)
--
-- ★ 정본은 파일(data/minigame/<game>/items*.json · worldprice/products.json — docs/18). 이 표는 **적재본**이다:
--   scripts/minigame-load.mjs 가 status 'verified' 만 넣고(같은 id 는 갱신 — 멱등) · 서버는 게임 시작 때 메모리로 올려 출제한다.
--   minigame_items    — 항목 하나(게임 · id · 파일 항목 그대로 payload(verify 칸 뺌) · 그림 id 들 · 출처 · 기준일 · 태그)
--   minigame_images   — 그림(bytea · mime · 크기 · 출처 표시). ★ 브리핑은 minigame_items 에 image bytea 한 칸이었지만
--                       '어느 쪽?' 은 그림이 둘(a · b)이고 빅맥 품목 그림도 있어 그림을 따로 뺐다(같은 그림 id = 파일 이름).
--   minigame_products — 빅맥 계열 품목(나라 행 rows jsonb · 환율 기준일 · 그림 id)
-- ★ 그림은 DB 가 정본이 된다(백업 포함 — DB-ADMIN). 서빙: GET /api/minigame/image/:imageId (로그인 · 캐시)
-- =============================================================================

CREATE TABLE IF NOT EXISTS minigame_images (
  image_id     text        PRIMARY KEY,
  mime         text        NOT NULL,
  width        integer     NOT NULL,
  height       integer     NOT NULL,
  bytes        integer     NOT NULL,
  data         bytea       NOT NULL,
  license      text,
  attribution  text,
  source_url   text,
  loaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS minigame_items (
  item_id      text        PRIMARY KEY,
  game         text        NOT NULL,
  status       text        NOT NULL,
  payload      jsonb       NOT NULL,
  image_ids    text[]      NOT NULL DEFAULT '{}',
  attribution  text,
  as_of        date,
  tags         text[]      NOT NULL DEFAULT '{}',
  source_file  text        NOT NULL,
  loaded_at    timestamptz NOT NULL DEFAULT now(),
  active       boolean     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS minigame_items_game_idx ON minigame_items (game) WHERE active;

CREATE TABLE IF NOT EXISTS minigame_products (
  product_id   text        PRIMARY KEY,
  payload      jsonb       NOT NULL,
  image_id     text,
  as_of        date,
  fx_as_of     date,
  loaded_at    timestamptz NOT NULL DEFAULT now()
);

-- 기록: 문항 id (퀴즈류 — 라운드 = 문항). 피지컬은 NULL
ALTER TABLE minigame_rounds ADD COLUMN IF NOT EXISTS item_id text;
