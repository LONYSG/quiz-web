-- =============================================================================
-- 0009. 게임 출제용 분야 묶음 (R034 / D-154)
--
-- ★★ 왜
--   건우: "분야를 고를 수 있게 해 달라 (복수 선택, 최소 하나)."
--   ★ 통계용 categories 트리(대·중·소분류)는 **그대로 둔다.** 그 위에 게임 출제용 묶음을 얹는다.
--   ★ R034 실측: 대분류 그대로 쓰면 영화·애니는 '문화·예술', 게임은 '스포츠·게임',
--     예능·가요는 '한국' 에 흩어져 있다 (브리핑의 주장이 사실로 확인됨). 그래서 따로 묶는다.
--
-- ★★ 설정은 한 곳 — categories.game_topic
--   · 대분류(level 1)에 **기본값**을 둔다
--   · 중분류(level 2)에 값이 있으면 그것이 이긴다 (예: 한국 대중음악 → 미디어·콘텐츠)
--   · 소분류(level 3)는 비워 둔다 → 중분류를 따른다. ★ 새 소분류는 손댈 것이 없다
--   · 새 중분류도 비워 두면 대분류 기본값을 따른다
--   · 옛 평면 카테고리(level 0)는 자기 값을 쓴다
--   → 실제 묶음은 뷰 category_game_topics 가 계산한다 (가장 가까운 조상의 값).
--
-- ★ game_topics 의 키는 shared/src/settings.ts 의 GAME_TOPICS 와 같아야 한다 (smoke 가 대조한다).
-- ★ 묶음을 바꾸려면: docs/DB-ADMIN.md "분야 묶음 바꾸기". 서버 재시작 없이 다음 로비 갱신부터 반영된다.
-- =============================================================================

CREATE TABLE IF NOT EXISTS game_topics (
  key        text     PRIMARY KEY,
  name_ko    text     NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

INSERT INTO game_topics (key, name_ko, sort_order) VALUES
  ('korea',   '한국',          10),
  ('history', '역사·사회',     20),
  ('science', '과학·기술',     30),
  ('arts',    '문화·예술',     40),
  ('sports',  '스포츠',        50),
  ('life',    '생활',          60),
  ('media',   '미디어·콘텐츠', 70)
ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS game_topic text REFERENCES game_topics(key);

-- ── 대분류 기본값
UPDATE categories SET game_topic = v.t FROM (VALUES
  ('L1:korea', 'korea'), ('L1:humanities', 'history'), ('L1:science', 'science'),
  ('L1:tech', 'science'), ('L1:arts', 'arts'), ('L1:sports', 'sports'), ('L1:life', 'life')
) AS v(k, t) WHERE categories.key = v.k;

-- ── 중분류 예외 — ★ 미디어·콘텐츠 (영화·애니·게임·드라마·웹툰·만화·예능·가요)
--   ★ 팝·록 음악도 '가요' 와 같은 대중음악이라 여기 넣었다 (자체 판단, 한 줄로 되돌릴 수 있다)
UPDATE categories SET game_topic = 'media' WHERE key IN (
  'L2:kr-music', 'L2:kr-screen', 'L2:kr-tv',
  'L2:popular-music', 'L2:world-cinema', 'L2:animation', 'L2:comics', 'L2:esports'
);
-- ── 보드게임·카드게임 → 생활 (스포츠 묶음에는 맞지 않는다. 자체 판단)
UPDATE categories SET game_topic = 'life' WHERE key = 'L2:board-game';

-- ── 옛 평면 카테고리 (level 0, 활성 43문제)
UPDATE categories SET game_topic = v.t FROM (VALUES
  ('general', 'life'), ('history', 'history'), ('geography', 'history'), ('science', 'science'),
  ('nature', 'science'), ('art', 'arts'), ('music', 'arts'), ('movie', 'media'),
  ('literature', 'arts'), ('math', 'science'), ('sports', 'sports'), ('tech', 'science'),
  ('myth', 'history'), ('language', 'life'), ('etc', 'life')
) AS v(k, t) WHERE categories.key = v.k AND categories.level = 0;

-- ── 실제 묶음 = 자기 → 부모 → 조부모 중 처음 값이 있는 것
CREATE OR REPLACE VIEW category_game_topics AS
SELECT c.id AS category_id,
       COALESCE(c.game_topic, p.game_topic, gp.game_topic) AS game_topic
  FROM categories c
  LEFT JOIN categories p  ON p.id  = c.parent_id
  LEFT JOIN categories gp ON gp.id = p.parent_id;
