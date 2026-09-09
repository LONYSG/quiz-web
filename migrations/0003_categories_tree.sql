-- =============================================================================
-- 0003. 카테고리 계층 (R012 / 작업 C-3)
--
-- ★★ 이 파일은 scripts/gen-migration-0003.mjs 가 생성한다. 손으로 고치지 않는다.
--   정본은 pipeline/src/categories.ts 다. 트리를 고치면 스크립트를 다시 돌린다.
--
-- ★★ 계층 설계 (R011 3-5 에서 판단하고 R012 에서 구현)
--
--   questions.category_id 가 가리킬 계층 = ★ 소분류(리프)
--     근거: 가장 세밀한 것을 저장하면 어느 계층으로든 집계할 수 있다. 반대는 불가능하다.
--
--   통계 단위 (guide 40절) = ★ 기본 대분류, 상세 중분류
--     근거: 소분류는 296개다. 한 사람이 소분류당 몇 문제를 못 풀어 정답률이 무의미해진다.
--     대분류 7개면 "역사 72% / 과학 84%" 처럼 읽힌다.
--
--   게임 화면 표시 = ★ 대분류
--     근거: 30초 안에 읽을 것은 짧아야 한다.
--     ★ 그리고 소분류 이름이 힌트가 되는 경우가 있다 —
--       소분류 "조선 전기" 가 보이면 답의 범위가 좁아진다.
--
-- ★ 기존 16개 플랫 카테고리를 지우지 않는다. 시드 문제 53건이 FK 로 참조한다.
--   level=0 으로 표시해 새 트리와 구분한다.
-- =============================================================================

-- ── 1. 계층 컬럼
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id smallint REFERENCES categories(id);

-- ★ level: 0=기존 플랫(R002) / 1=대분류 / 2=중분류 / 3=소분류
--   ★ 0 을 남기는 이유는 위 주석에 있다. 시드 문제가 참조한다.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS level smallint NOT NULL DEFAULT 0;

-- ★ 통계 집계에 쓴다. 소분류에서 대분류까지 올라가지 않고 바로 묶을 수 있다.
CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories (parent_id);
CREATE INDEX IF NOT EXISTS categories_level_idx ON categories (level);

-- ★ 기존 행을 level=0 으로 명시한다 (DEFAULT 로 이미 0 이지만 의도를 남긴다)
UPDATE categories SET level = 0 WHERE parent_id IS NULL AND level = 0;

-- ── 2. 대분류 (level 1)
--   ★ key 에 접두사를 붙인다. 기존 16개와 이름이 겹칠 수 있기 때문이다
--   (기존 'science' 와 새 대분류 '자연과학' 은 다른 것이다).

INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ('L1:korea', '한국', 10, 1, NULL) ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ('L1:humanities', '인문·사회', 20, 1, NULL) ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ('L1:science', '자연과학', 30, 1, NULL) ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ('L1:tech', '기술·의학', 40, 1, NULL) ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ('L1:arts', '문화·예술', 50, 1, NULL) ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ('L1:sports', '스포츠·게임', 60, 1, NULL) ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id) VALUES ('L1:life', '생활·상식', 70, 1, NULL) ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order;

-- ── 3. 중분류 (level 2)

-- 한국 (9개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-history', '한국사', 10, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-geo', '한국 지리', 20, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-lit', '한국 문학', 30, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-tradition', '한국 전통문화·풍습', 40, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-music', '한국 대중음악', 50, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-screen', '한국 영화·드라마', 60, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-tv', '한국 방송·예능', 70, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-food', '한국 음식', 80, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:kr-language', '한국어·한글', 90, 2, id, true FROM categories WHERE key = 'L1:korea' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 인문·사회 (11개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:world-history-west', '서양사', 100, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:world-history-east', '동양사', 110, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:war-history', '전쟁·군사사', 120, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:myth', '신화', 130, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:religion', '종교·경전 상식', 140, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:philosophy', '철학·사상', 150, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:psychology', '심리학 상식', 160, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:economy', '경제·금융 상식', 170, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:politics', '정치·법 상식', 180, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:society', '사회 제도', 190, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:world-geo', '세계 지리·국가·수도', 200, 2, id, true FROM categories WHERE key = 'L1:humanities' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 자연과학 (9개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:physics', '물리', 210, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:chemistry', '화학·원소', 220, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:biology', '생물학', 230, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:human-body', '인체·해부', 240, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:animals', '동물', 250, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:plants', '식물', 260, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:earth', '지구과학·기상', 270, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:astronomy', '천문·우주', 280, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:math', '수학·수 상식', 290, 2, id, true FROM categories WHERE key = 'L1:science' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 기술·의학 (7개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:medicine', '의학·건강 상식', 300, 2, id, true FROM categories WHERE key = 'L1:tech' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:computer', '컴퓨터·인터넷', 310, 2, id, true FROM categories WHERE key = 'L1:tech' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:invention', '발명·발견', 320, 2, id, true FROM categories WHERE key = 'L1:tech' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:transport', '자동차·교통', 330, 2, id, true FROM categories WHERE key = 'L1:tech' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:aerospace', '항공·우주 기술', 340, 2, id, true FROM categories WHERE key = 'L1:tech' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:energy', '에너지·환경 기술', 350, 2, id, true FROM categories WHERE key = 'L1:tech' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:material', '재료·건설 기술', 360, 2, id, true FROM categories WHERE key = 'L1:tech' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 문화·예술 (11개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:art', '미술·화가', 370, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:classical', '클래식 음악', 380, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:popular-music', '팝·록 음악', 390, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:music-theory', '음악 이론·악기', 400, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:world-cinema', '세계 영화', 410, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:animation', '애니메이션', 420, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:comics', '만화·웹툰', 430, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:world-lit', '세계 문학', 440, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:theatre', '공연·연극·뮤지컬', 450, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:architecture', '건축', 460, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:design-photo', '사진·디자인', 470, 2, id, true FROM categories WHERE key = 'L1:arts' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 스포츠·게임 (7개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:football', '축구', 480, 2, id, true FROM categories WHERE key = 'L1:sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:baseball', '야구', 490, 2, id, true FROM categories WHERE key = 'L1:sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:olympic', '올림픽·국제대회', 500, 2, id, true FROM categories WHERE key = 'L1:sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:ball-sports', '농구·배구·기타 구기', 510, 2, id, true FROM categories WHERE key = 'L1:sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:combat-athletics', '격투기·육상·수영', 520, 2, id, true FROM categories WHERE key = 'L1:sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:board-game', '보드게임·카드게임', 530, 2, id, true FROM categories WHERE key = 'L1:sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:esports', 'e스포츠·비디오게임', 540, 2, id, true FROM categories WHERE key = 'L1:sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 생활·상식 (9개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:world-food', '세계 음식·요리', 550, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:drinks', '술·음료', 560, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:brands', '브랜드·기업', 570, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:world-language', '세계 언어·어원', 580, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:symbols', '기호·상징·표지', 590, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:calendar', '절기·기념일·축제', 600, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:fashion', '의복·패션', 610, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:daily-rule', '생활 규칙·안전', 620, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L2:pets-garden', '반려동물·원예', 630, 2, id, true FROM categories WHERE key = 'L1:life' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- ── 4. 소분류 (level 3) — ★ questions.category_id 가 가리킬 계층

-- 한국사 (6개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-history#1', '삼국·통일신라', 10, 3, id, true FROM categories WHERE key = 'L2:kr-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-history#2', '고려', 20, 3, id, true FROM categories WHERE key = 'L2:kr-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-history#3', '조선 전기', 30, 3, id, true FROM categories WHERE key = 'L2:kr-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-history#4', '조선 후기', 40, 3, id, true FROM categories WHERE key = 'L2:kr-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-history#5', '개항기·일제강점기', 50, 3, id, true FROM categories WHERE key = 'L2:kr-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-history#6', '대한민국 현대', 60, 3, id, true FROM categories WHERE key = 'L2:kr-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국 지리 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-geo#1', '행정구역·도시', 70, 3, id, true FROM categories WHERE key = 'L2:kr-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-geo#2', '산·강·호수', 80, 3, id, true FROM categories WHERE key = 'L2:kr-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-geo#3', '섬·해안', 90, 3, id, true FROM categories WHERE key = 'L2:kr-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-geo#4', '지역 특산·별칭', 100, 3, id, true FROM categories WHERE key = 'L2:kr-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국 문학 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-lit#1', '고전 산문', 110, 3, id, true FROM categories WHERE key = 'L2:kr-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-lit#2', '고전 시가', 120, 3, id, true FROM categories WHERE key = 'L2:kr-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-lit#3', '근대 소설', 130, 3, id, true FROM categories WHERE key = 'L2:kr-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-lit#4', '현대 소설', 140, 3, id, true FROM categories WHERE key = 'L2:kr-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-lit#5', '현대 시', 150, 3, id, true FROM categories WHERE key = 'L2:kr-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국 전통문화·풍습 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tradition#1', '명절·세시풍속', 160, 3, id, true FROM categories WHERE key = 'L2:kr-tradition' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tradition#2', '전통 의식주', 170, 3, id, true FROM categories WHERE key = 'L2:kr-tradition' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tradition#3', '민속놀이', 180, 3, id, true FROM categories WHERE key = 'L2:kr-tradition' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tradition#4', '국악·전통 예술', 190, 3, id, true FROM categories WHERE key = 'L2:kr-tradition' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tradition#5', '관혼상제', 200, 3, id, true FROM categories WHERE key = 'L2:kr-tradition' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국 대중음악 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-music#1', '1980년대 이전 가요', 210, 3, id, true FROM categories WHERE key = 'L2:kr-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-music#2', '1990년대 가요', 220, 3, id, true FROM categories WHERE key = 'L2:kr-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-music#3', '2000년대 이후 가요', 230, 3, id, true FROM categories WHERE key = 'L2:kr-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-music#4', '아이돌·K팝', 240, 3, id, true FROM categories WHERE key = 'L2:kr-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-music#5', '트로트·포크', 250, 3, id, true FROM categories WHERE key = 'L2:kr-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국 영화·드라마 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-screen#1', '1990년대 이전 한국 영화', 260, 3, id, true FROM categories WHERE key = 'L2:kr-screen' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-screen#2', '2000년대 이후 한국 영화', 270, 3, id, true FROM categories WHERE key = 'L2:kr-screen' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-screen#3', '한국 드라마', 280, 3, id, true FROM categories WHERE key = 'L2:kr-screen' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-screen#4', '한국 독립·예술영화', 290, 3, id, true FROM categories WHERE key = 'L2:kr-screen' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국 방송·예능 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tv#1', '예능 프로그램', 300, 3, id, true FROM categories WHERE key = 'L2:kr-tv' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tv#2', '유행어', 310, 3, id, true FROM categories WHERE key = 'L2:kr-tv' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tv#3', '광고', 320, 3, id, true FROM categories WHERE key = 'L2:kr-tv' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tv#4', '라디오·성우', 330, 3, id, true FROM categories WHERE key = 'L2:kr-tv' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국 음식 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-food#1', '밥·국·찌개', 340, 3, id, true FROM categories WHERE key = 'L2:kr-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-food#2', '김치·반찬', 350, 3, id, true FROM categories WHERE key = 'L2:kr-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-food#3', '분식·길거리 음식', 360, 3, id, true FROM categories WHERE key = 'L2:kr-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-food#4', '향토 음식', 370, 3, id, true FROM categories WHERE key = 'L2:kr-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-food#5', '떡·한과·전통 음료', 380, 3, id, true FROM categories WHERE key = 'L2:kr-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 한국어·한글 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-language#1', '한글 자모·맞춤법', 390, 3, id, true FROM categories WHERE key = 'L2:kr-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-language#2', '순우리말', 400, 3, id, true FROM categories WHERE key = 'L2:kr-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-language#3', '속담·관용어', 410, 3, id, true FROM categories WHERE key = 'L2:kr-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-language#4', '사자성어', 420, 3, id, true FROM categories WHERE key = 'L2:kr-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-language#5', '높임말·어법', 430, 3, id, true FROM categories WHERE key = 'L2:kr-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 서양사 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-west#1', '고대 그리스·로마', 440, 3, id, true FROM categories WHERE key = 'L2:world-history-west' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-west#2', '중세 유럽', 450, 3, id, true FROM categories WHERE key = 'L2:world-history-west' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-west#3', '르네상스·대항해', 460, 3, id, true FROM categories WHERE key = 'L2:world-history-west' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-west#4', '근대 유럽·혁명', 470, 3, id, true FROM categories WHERE key = 'L2:world-history-west' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-west#5', '20세기 서양', 480, 3, id, true FROM categories WHERE key = 'L2:world-history-west' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 동양사 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-east#1', '중국 왕조', 490, 3, id, true FROM categories WHERE key = 'L2:world-history-east' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-east#2', '일본사', 500, 3, id, true FROM categories WHERE key = 'L2:world-history-east' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-east#3', '인도·동남아', 510, 3, id, true FROM categories WHERE key = 'L2:world-history-east' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-history-east#4', '중동·이슬람 세계', 520, 3, id, true FROM categories WHERE key = 'L2:world-history-east' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 전쟁·군사사 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:war-history#1', '고대·중세 전쟁', 530, 3, id, true FROM categories WHERE key = 'L2:war-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:war-history#2', '제1차 세계대전', 540, 3, id, true FROM categories WHERE key = 'L2:war-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:war-history#3', '제2차 세계대전', 550, 3, id, true FROM categories WHERE key = 'L2:war-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:war-history#4', '냉전 이후', 560, 3, id, true FROM categories WHERE key = 'L2:war-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:war-history#5', '무기·군사 용어', 570, 3, id, true FROM categories WHERE key = 'L2:war-history' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 신화 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:myth#1', '그리스·로마 신화', 580, 3, id, true FROM categories WHERE key = 'L2:myth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:myth#2', '북유럽 신화', 590, 3, id, true FROM categories WHERE key = 'L2:myth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:myth#3', '이집트·메소포타미아 신화', 600, 3, id, true FROM categories WHERE key = 'L2:myth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:myth#4', '동양·기타 신화', 610, 3, id, true FROM categories WHERE key = 'L2:myth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 종교·경전 상식 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#1', '기독교·성경', 620, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#2', '불교', 630, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#3', '이슬람', 640, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#4', '기타 종교·종파', 650, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#5', '종교 의식·상징', 660, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 철학·사상 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:philosophy#1', '고대 철학', 670, 3, id, true FROM categories WHERE key = 'L2:philosophy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:philosophy#2', '근대 철학', 680, 3, id, true FROM categories WHERE key = 'L2:philosophy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:philosophy#3', '현대 철학', 690, 3, id, true FROM categories WHERE key = 'L2:philosophy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:philosophy#4', '동양 사상', 700, 3, id, true FROM categories WHERE key = 'L2:philosophy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:philosophy#5', '철학 용어·명제', 710, 3, id, true FROM categories WHERE key = 'L2:philosophy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 심리학 상식 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:psychology#1', '심리 현상·효과', 720, 3, id, true FROM categories WHERE key = 'L2:psychology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:psychology#2', '발달·성격 이론', 730, 3, id, true FROM categories WHERE key = 'L2:psychology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:psychology#3', '심리학자·유명 실험', 740, 3, id, true FROM categories WHERE key = 'L2:psychology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:psychology#4', '정신 건강 용어', 750, 3, id, true FROM categories WHERE key = 'L2:psychology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 경제·금융 상식 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:economy#1', '경제 개념·지표', 760, 3, id, true FROM categories WHERE key = 'L2:economy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:economy#2', '화폐·환율', 770, 3, id, true FROM categories WHERE key = 'L2:economy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:economy#3', '금융 상품·시장', 780, 3, id, true FROM categories WHERE key = 'L2:economy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:economy#4', '기업·경영 용어', 790, 3, id, true FROM categories WHERE key = 'L2:economy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:economy#5', '경제사', 800, 3, id, true FROM categories WHERE key = 'L2:economy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 정치·법 상식 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:politics#1', '정치 체제·기구', 810, 3, id, true FROM categories WHERE key = 'L2:politics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:politics#2', '선거·의회', 820, 3, id, true FROM categories WHERE key = 'L2:politics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:politics#3', '헌법·법 개념', 830, 3, id, true FROM categories WHERE key = 'L2:politics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:politics#4', '국제기구·조약', 840, 3, id, true FROM categories WHERE key = 'L2:politics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:politics#5', '법률 용어', 850, 3, id, true FROM categories WHERE key = 'L2:politics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 사회 제도 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:society#1', '교육 제도', 860, 3, id, true FROM categories WHERE key = 'L2:society' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:society#2', '복지·의료 제도', 870, 3, id, true FROM categories WHERE key = 'L2:society' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:society#3', '인구·통계 개념', 880, 3, id, true FROM categories WHERE key = 'L2:society' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:society#4', '사회학 개념', 890, 3, id, true FROM categories WHERE key = 'L2:society' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 세계 지리·국가·수도 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-geo#1', '국가·수도', 900, 3, id, true FROM categories WHERE key = 'L2:world-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-geo#2', '대륙·바다', 910, 3, id, true FROM categories WHERE key = 'L2:world-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-geo#3', '랜드마크·지형', 920, 3, id, true FROM categories WHERE key = 'L2:world-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-geo#4', '국경·영토', 930, 3, id, true FROM categories WHERE key = 'L2:world-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-geo#5', '도시 별칭', 940, 3, id, true FROM categories WHERE key = 'L2:world-geo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 물리 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:physics#1', '역학·운동', 950, 3, id, true FROM categories WHERE key = 'L2:physics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:physics#2', '전기·자기', 960, 3, id, true FROM categories WHERE key = 'L2:physics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:physics#3', '빛·소리·파동', 970, 3, id, true FROM categories WHERE key = 'L2:physics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:physics#4', '열·에너지', 980, 3, id, true FROM categories WHERE key = 'L2:physics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:physics#5', '현대 물리', 990, 3, id, true FROM categories WHERE key = 'L2:physics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 화학·원소 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:chemistry#1', '원소 기호', 1000, 3, id, true FROM categories WHERE key = 'L2:chemistry' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:chemistry#2', '주기율표', 1010, 3, id, true FROM categories WHERE key = 'L2:chemistry' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:chemistry#3', '화합물·분자', 1020, 3, id, true FROM categories WHERE key = 'L2:chemistry' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:chemistry#4', '화학 반응', 1030, 3, id, true FROM categories WHERE key = 'L2:chemistry' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:chemistry#5', '실생활 화학', 1040, 3, id, true FROM categories WHERE key = 'L2:chemistry' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 생물학 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:biology#1', '세포·유전', 1050, 3, id, true FROM categories WHERE key = 'L2:biology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:biology#2', '분류·진화', 1060, 3, id, true FROM categories WHERE key = 'L2:biology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:biology#3', '생태계', 1070, 3, id, true FROM categories WHERE key = 'L2:biology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:biology#4', '미생물·바이러스', 1080, 3, id, true FROM categories WHERE key = 'L2:biology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:biology#5', '식물 생리', 1090, 3, id, true FROM categories WHERE key = 'L2:biology' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 인체·해부 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:human-body#1', '뼈·근육', 1100, 3, id, true FROM categories WHERE key = 'L2:human-body' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:human-body#2', '장기·순환', 1110, 3, id, true FROM categories WHERE key = 'L2:human-body' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:human-body#3', '감각기관', 1120, 3, id, true FROM categories WHERE key = 'L2:human-body' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:human-body#4', '신경·뇌', 1130, 3, id, true FROM categories WHERE key = 'L2:human-body' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:human-body#5', '혈액·면역', 1140, 3, id, true FROM categories WHERE key = 'L2:human-body' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 동물 (6개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animals#1', '포유류', 1150, 3, id, true FROM categories WHERE key = 'L2:animals' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animals#2', '조류', 1160, 3, id, true FROM categories WHERE key = 'L2:animals' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animals#3', '어류·해양 생물', 1170, 3, id, true FROM categories WHERE key = 'L2:animals' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animals#4', '곤충·절지동물', 1180, 3, id, true FROM categories WHERE key = 'L2:animals' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animals#5', '파충류·양서류', 1190, 3, id, true FROM categories WHERE key = 'L2:animals' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animals#6', '동물의 습성·생태', 1200, 3, id, true FROM categories WHERE key = 'L2:animals' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 식물 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:plants#1', '나무', 1210, 3, id, true FROM categories WHERE key = 'L2:plants' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:plants#2', '꽃·꽃말', 1220, 3, id, true FROM categories WHERE key = 'L2:plants' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:plants#3', '작물·과일', 1230, 3, id, true FROM categories WHERE key = 'L2:plants' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:plants#4', '식물 이름의 유래', 1240, 3, id, true FROM categories WHERE key = 'L2:plants' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 지구과학·기상 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:earth#1', '지질·암석', 1250, 3, id, true FROM categories WHERE key = 'L2:earth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:earth#2', '화산·지진', 1260, 3, id, true FROM categories WHERE key = 'L2:earth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:earth#3', '대기·기상', 1270, 3, id, true FROM categories WHERE key = 'L2:earth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:earth#4', '해양', 1280, 3, id, true FROM categories WHERE key = 'L2:earth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:earth#5', '기후 변화', 1290, 3, id, true FROM categories WHERE key = 'L2:earth' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 천문·우주 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:astronomy#1', '태양계', 1300, 3, id, true FROM categories WHERE key = 'L2:astronomy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:astronomy#2', '별·별자리', 1310, 3, id, true FROM categories WHERE key = 'L2:astronomy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:astronomy#3', '은하·우주론', 1320, 3, id, true FROM categories WHERE key = 'L2:astronomy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:astronomy#4', '우주 현상·관측', 1330, 3, id, true FROM categories WHERE key = 'L2:astronomy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 수학·수 상식 (6개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:math#1', '수와 연산', 1340, 3, id, true FROM categories WHERE key = 'L2:math' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:math#2', '도형·기하', 1350, 3, id, true FROM categories WHERE key = 'L2:math' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:math#3', '확률·통계', 1360, 3, id, true FROM categories WHERE key = 'L2:math' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:math#4', '수학 기호·용어', 1370, 3, id, true FROM categories WHERE key = 'L2:math' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:math#5', '단위·측정', 1380, 3, id, true FROM categories WHERE key = 'L2:math' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:math#6', '유명한 수·정리', 1390, 3, id, true FROM categories WHERE key = 'L2:math' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 의학·건강 상식 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:medicine#1', '질병', 1400, 3, id, true FROM categories WHERE key = 'L2:medicine' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:medicine#2', '증상·진단', 1410, 3, id, true FROM categories WHERE key = 'L2:medicine' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:medicine#3', '의약품·백신', 1420, 3, id, true FROM categories WHERE key = 'L2:medicine' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:medicine#4', '영양·비타민', 1430, 3, id, true FROM categories WHERE key = 'L2:medicine' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:medicine#5', '응급처치', 1440, 3, id, true FROM categories WHERE key = 'L2:medicine' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 컴퓨터·인터넷 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:computer#1', '하드웨어', 1450, 3, id, true FROM categories WHERE key = 'L2:computer' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:computer#2', '소프트웨어·운영체제', 1460, 3, id, true FROM categories WHERE key = 'L2:computer' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:computer#3', '프로그래밍 용어', 1470, 3, id, true FROM categories WHERE key = 'L2:computer' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:computer#4', '네트워크·인터넷', 1480, 3, id, true FROM categories WHERE key = 'L2:computer' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:computer#5', '정보 보안', 1490, 3, id, true FROM categories WHERE key = 'L2:computer' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 발명·발견 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:invention#1', '산업혁명기 발명', 1500, 3, id, true FROM categories WHERE key = 'L2:invention' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:invention#2', '20세기 이후 발명', 1510, 3, id, true FROM categories WHERE key = 'L2:invention' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:invention#3', '물리·화학 분야 발견', 1520, 3, id, true FROM categories WHERE key = 'L2:invention' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:invention#4', '의학·생명 분야 발견', 1530, 3, id, true FROM categories WHERE key = 'L2:invention' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 자동차·교통 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:transport#1', '자동차 구조·용어', 1540, 3, id, true FROM categories WHERE key = 'L2:transport' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:transport#2', '자동차 브랜드·역사', 1550, 3, id, true FROM categories WHERE key = 'L2:transport' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:transport#3', '철도', 1560, 3, id, true FROM categories WHERE key = 'L2:transport' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:transport#4', '선박', 1570, 3, id, true FROM categories WHERE key = 'L2:transport' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:transport#5', '도로·교통 체계', 1580, 3, id, true FROM categories WHERE key = 'L2:transport' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 항공·우주 기술 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:aerospace#1', '항공기', 1590, 3, id, true FROM categories WHERE key = 'L2:aerospace' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:aerospace#2', '항공사·공항', 1600, 3, id, true FROM categories WHERE key = 'L2:aerospace' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:aerospace#3', '로켓·발사체', 1610, 3, id, true FROM categories WHERE key = 'L2:aerospace' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:aerospace#4', '유인 우주 탐사', 1620, 3, id, true FROM categories WHERE key = 'L2:aerospace' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:aerospace#5', '인공위성·탐사선', 1630, 3, id, true FROM categories WHERE key = 'L2:aerospace' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 에너지·환경 기술 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:energy#1', '발전 방식', 1640, 3, id, true FROM categories WHERE key = 'L2:energy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:energy#2', '재생 에너지', 1650, 3, id, true FROM categories WHERE key = 'L2:energy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:energy#3', '자원·연료', 1660, 3, id, true FROM categories WHERE key = 'L2:energy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:energy#4', '환경 협약·오염', 1670, 3, id, true FROM categories WHERE key = 'L2:energy' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 재료·건설 기술 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:material#1', '금속·합금', 1680, 3, id, true FROM categories WHERE key = 'L2:material' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:material#2', '플라스틱·신소재', 1690, 3, id, true FROM categories WHERE key = 'L2:material' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:material#3', '건설 공법', 1700, 3, id, true FROM categories WHERE key = 'L2:material' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:material#4', '토목 구조물', 1710, 3, id, true FROM categories WHERE key = 'L2:material' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 미술·화가 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:art#1', '서양 회화', 1720, 3, id, true FROM categories WHERE key = 'L2:art' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:art#2', '조각', 1730, 3, id, true FROM categories WHERE key = 'L2:art' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:art#3', '한국·동양 미술', 1740, 3, id, true FROM categories WHERE key = 'L2:art' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:art#4', '미술 사조', 1750, 3, id, true FROM categories WHERE key = 'L2:art' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:art#5', '판화·공예', 1760, 3, id, true FROM categories WHERE key = 'L2:art' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 클래식 음악 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:classical#1', '작곡가', 1770, 3, id, true FROM categories WHERE key = 'L2:classical' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:classical#2', '작품·악곡', 1780, 3, id, true FROM categories WHERE key = 'L2:classical' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:classical#3', '오페라', 1790, 3, id, true FROM categories WHERE key = 'L2:classical' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:classical#4', '음악 형식·용어', 1800, 3, id, true FROM categories WHERE key = 'L2:classical' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 팝·록 음악 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:popular-music#1', '1960~70년대', 1810, 3, id, true FROM categories WHERE key = 'L2:popular-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:popular-music#2', '1980~90년대', 1820, 3, id, true FROM categories WHERE key = 'L2:popular-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:popular-music#3', '2000년대 이후', 1830, 3, id, true FROM categories WHERE key = 'L2:popular-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:popular-music#4', '밴드·아티스트', 1840, 3, id, true FROM categories WHERE key = 'L2:popular-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:popular-music#5', '힙합·일렉트로닉', 1850, 3, id, true FROM categories WHERE key = 'L2:popular-music' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 음악 이론·악기 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:music-theory#1', '악보·기호', 1860, 3, id, true FROM categories WHERE key = 'L2:music-theory' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:music-theory#2', '음계·화성', 1870, 3, id, true FROM categories WHERE key = 'L2:music-theory' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:music-theory#3', '관현악기', 1880, 3, id, true FROM categories WHERE key = 'L2:music-theory' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:music-theory#4', '건반·타악기', 1890, 3, id, true FROM categories WHERE key = 'L2:music-theory' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:music-theory#5', '세계 전통 악기', 1900, 3, id, true FROM categories WHERE key = 'L2:music-theory' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 세계 영화 (6개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-cinema#1', '할리우드 고전', 1910, 3, id, true FROM categories WHERE key = 'L2:world-cinema' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-cinema#2', '현대 할리우드', 1920, 3, id, true FROM categories WHERE key = 'L2:world-cinema' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-cinema#3', '유럽·아시아 영화', 1930, 3, id, true FROM categories WHERE key = 'L2:world-cinema' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-cinema#4', '감독', 1940, 3, id, true FROM categories WHERE key = 'L2:world-cinema' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-cinema#5', '영화상', 1950, 3, id, true FROM categories WHERE key = 'L2:world-cinema' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-cinema#6', '영화 용어·기법', 1960, 3, id, true FROM categories WHERE key = 'L2:world-cinema' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 애니메이션 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animation#1', '일본 애니메이션', 1970, 3, id, true FROM categories WHERE key = 'L2:animation' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animation#2', '디즈니·픽사 극장 애니메이션', 1980, 3, id, true FROM categories WHERE key = 'L2:animation' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animation#3', '서양 TV 애니메이션', 1990, 3, id, true FROM categories WHERE key = 'L2:animation' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animation#4', '유럽 애니메이션', 2000, 3, id, true FROM categories WHERE key = 'L2:animation' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:animation#5', '제작사·스튜디오', 2010, 3, id, true FROM categories WHERE key = 'L2:animation' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 만화·웹툰 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:comics#1', '일본 만화', 2020, 3, id, true FROM categories WHERE key = 'L2:comics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:comics#2', '미국 코믹스·히어로', 2030, 3, id, true FROM categories WHERE key = 'L2:comics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:comics#3', '한국 만화·웹툰', 2040, 3, id, true FROM categories WHERE key = 'L2:comics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:comics#4', '만화 용어·형식', 2050, 3, id, true FROM categories WHERE key = 'L2:comics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 세계 문학 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-lit#1', '고전(고대~18세기)', 2060, 3, id, true FROM categories WHERE key = 'L2:world-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-lit#2', '19세기 소설', 2070, 3, id, true FROM categories WHERE key = 'L2:world-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-lit#3', '20세기 문학', 2080, 3, id, true FROM categories WHERE key = 'L2:world-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-lit#4', '시·희곡', 2090, 3, id, true FROM categories WHERE key = 'L2:world-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-lit#5', '동아시아 문학', 2100, 3, id, true FROM categories WHERE key = 'L2:world-lit' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 공연·연극·뮤지컬 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:theatre#1', '연극 사조·연출', 2110, 3, id, true FROM categories WHERE key = 'L2:theatre' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:theatre#2', '뮤지컬 작품', 2120, 3, id, true FROM categories WHERE key = 'L2:theatre' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:theatre#3', '무용·발레', 2130, 3, id, true FROM categories WHERE key = 'L2:theatre' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:theatre#4', '공연 용어·유명 극장', 2140, 3, id, true FROM categories WHERE key = 'L2:theatre' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 건축 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:architecture#1', '건축 양식', 2150, 3, id, true FROM categories WHERE key = 'L2:architecture' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:architecture#2', '건축가', 2160, 3, id, true FROM categories WHERE key = 'L2:architecture' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:architecture#3', '유명 건축물', 2170, 3, id, true FROM categories WHERE key = 'L2:architecture' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:architecture#4', '한국 건축', 2180, 3, id, true FROM categories WHERE key = 'L2:architecture' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 사진·디자인 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:design-photo#1', '사진 기술·용어', 2190, 3, id, true FROM categories WHERE key = 'L2:design-photo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:design-photo#2', '사진가·유명 사진', 2200, 3, id, true FROM categories WHERE key = 'L2:design-photo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:design-photo#3', '그래픽 디자인', 2210, 3, id, true FROM categories WHERE key = 'L2:design-photo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:design-photo#4', '산업 디자인', 2220, 3, id, true FROM categories WHERE key = 'L2:design-photo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:design-photo#5', '타이포그래피·색채', 2230, 3, id, true FROM categories WHERE key = 'L2:design-photo' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 축구 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:football#1', '규칙', 2240, 3, id, true FROM categories WHERE key = 'L2:football' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:football#2', '월드컵', 2250, 3, id, true FROM categories WHERE key = 'L2:football' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:football#3', '유럽 리그', 2260, 3, id, true FROM categories WHERE key = 'L2:football' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:football#4', 'K리그·아시아', 2270, 3, id, true FROM categories WHERE key = 'L2:football' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:football#5', '축구 역사·클럽', 2280, 3, id, true FROM categories WHERE key = 'L2:football' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 야구 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:baseball#1', '규칙', 2290, 3, id, true FROM categories WHERE key = 'L2:baseball' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:baseball#2', 'KBO', 2300, 3, id, true FROM categories WHERE key = 'L2:baseball' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:baseball#3', 'MLB', 2310, 3, id, true FROM categories WHERE key = 'L2:baseball' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:baseball#4', '야구 용어·전술', 2320, 3, id, true FROM categories WHERE key = 'L2:baseball' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 올림픽·국제대회 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:olympic#1', '하계 올림픽', 2330, 3, id, true FROM categories WHERE key = 'L2:olympic' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:olympic#2', '동계 올림픽', 2340, 3, id, true FROM categories WHERE key = 'L2:olympic' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:olympic#3', '종목·규정', 2350, 3, id, true FROM categories WHERE key = 'L2:olympic' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:olympic#4', '올림픽 상징·의례', 2360, 3, id, true FROM categories WHERE key = 'L2:olympic' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 농구·배구·기타 구기 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:ball-sports#1', '농구', 2370, 3, id, true FROM categories WHERE key = 'L2:ball-sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:ball-sports#2', '배구', 2380, 3, id, true FROM categories WHERE key = 'L2:ball-sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:ball-sports#3', '테니스', 2390, 3, id, true FROM categories WHERE key = 'L2:ball-sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:ball-sports#4', '골프', 2400, 3, id, true FROM categories WHERE key = 'L2:ball-sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:ball-sports#5', '탁구·배드민턴', 2410, 3, id, true FROM categories WHERE key = 'L2:ball-sports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 격투기·육상·수영 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:combat-athletics#1', '격투기·복싱', 2420, 3, id, true FROM categories WHERE key = 'L2:combat-athletics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:combat-athletics#2', '태권도·유도·씨름', 2430, 3, id, true FROM categories WHERE key = 'L2:combat-athletics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:combat-athletics#3', '육상', 2440, 3, id, true FROM categories WHERE key = 'L2:combat-athletics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:combat-athletics#4', '수영·수상 종목', 2450, 3, id, true FROM categories WHERE key = 'L2:combat-athletics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:combat-athletics#5', '동계 종목', 2460, 3, id, true FROM categories WHERE key = 'L2:combat-athletics' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 보드게임·카드게임 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:board-game#1', '바둑·장기', 2470, 3, id, true FROM categories WHERE key = 'L2:board-game' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:board-game#2', '체스', 2480, 3, id, true FROM categories WHERE key = 'L2:board-game' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:board-game#3', '화투·카드', 2490, 3, id, true FROM categories WHERE key = 'L2:board-game' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:board-game#4', '보드게임', 2500, 3, id, true FROM categories WHERE key = 'L2:board-game' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:board-game#5', '퍼즐', 2510, 3, id, true FROM categories WHERE key = 'L2:board-game' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- e스포츠·비디오게임 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:esports#1', '고전 게임(1980~90년대)', 2520, 3, id, true FROM categories WHERE key = 'L2:esports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:esports#2', '콘솔 게임', 2530, 3, id, true FROM categories WHERE key = 'L2:esports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:esports#3', 'PC·온라인 게임', 2540, 3, id, true FROM categories WHERE key = 'L2:esports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:esports#4', 'e스포츠 대회·선수', 2550, 3, id, true FROM categories WHERE key = 'L2:esports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:esports#5', '게임 용어', 2560, 3, id, true FROM categories WHERE key = 'L2:esports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 세계 음식·요리 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-food#1', '아시아 음식', 2570, 3, id, true FROM categories WHERE key = 'L2:world-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-food#2', '유럽 음식', 2580, 3, id, true FROM categories WHERE key = 'L2:world-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-food#3', '아메리카 음식', 2590, 3, id, true FROM categories WHERE key = 'L2:world-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-food#4', '조리법·조리 도구', 2600, 3, id, true FROM categories WHERE key = 'L2:world-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-food#5', '향신료·재료', 2610, 3, id, true FROM categories WHERE key = 'L2:world-food' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 술·음료 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:drinks#1', '와인', 2620, 3, id, true FROM categories WHERE key = 'L2:drinks' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:drinks#2', '위스키·증류주', 2630, 3, id, true FROM categories WHERE key = 'L2:drinks' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:drinks#3', '맥주', 2640, 3, id, true FROM categories WHERE key = 'L2:drinks' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:drinks#4', '전통주', 2650, 3, id, true FROM categories WHERE key = 'L2:drinks' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:drinks#5', '커피·차', 2660, 3, id, true FROM categories WHERE key = 'L2:drinks' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 브랜드·기업 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:brands#1', '기업 창업·역사', 2670, 3, id, true FROM categories WHERE key = 'L2:brands' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:brands#2', '로고·상징', 2680, 3, id, true FROM categories WHERE key = 'L2:brands' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:brands#3', '상표가 된 상품명', 2690, 3, id, true FROM categories WHERE key = 'L2:brands' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:brands#4', '기업 국적', 2700, 3, id, true FROM categories WHERE key = 'L2:brands' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 세계 언어·어원 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-language#1', '외래어 어원', 2710, 3, id, true FROM categories WHERE key = 'L2:world-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-language#2', '라틴어·그리스어 어근', 2720, 3, id, true FROM categories WHERE key = 'L2:world-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-language#3', '문자 체계', 2730, 3, id, true FROM categories WHERE key = 'L2:world-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-language#4', '세계 언어 분포', 2740, 3, id, true FROM categories WHERE key = 'L2:world-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-language#5', '외국어 표현', 2750, 3, id, true FROM categories WHERE key = 'L2:world-language' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 기호·상징·표지 (5개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:symbols#1', '국기·국장', 2760, 3, id, true FROM categories WHERE key = 'L2:symbols' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:symbols#2', '교통 표지', 2770, 3, id, true FROM categories WHERE key = 'L2:symbols' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:symbols#3', '색의 상징', 2780, 3, id, true FROM categories WHERE key = 'L2:symbols' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:symbols#4', '기호·아이콘', 2790, 3, id, true FROM categories WHERE key = 'L2:symbols' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:symbols#5', '별자리·십이지', 2800, 3, id, true FROM categories WHERE key = 'L2:symbols' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 절기·기념일·축제 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:calendar#1', '세계 명절·축제', 2810, 3, id, true FROM categories WHERE key = 'L2:calendar' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:calendar#2', '국제 기념일', 2820, 3, id, true FROM categories WHERE key = 'L2:calendar' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:calendar#3', '달력·역법', 2830, 3, id, true FROM categories WHERE key = 'L2:calendar' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:calendar#4', '계절·절기', 2840, 3, id, true FROM categories WHERE key = 'L2:calendar' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 의복·패션 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:fashion#1', '의류 명칭', 2850, 3, id, true FROM categories WHERE key = 'L2:fashion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:fashion#2', '패션 브랜드·디자이너', 2860, 3, id, true FROM categories WHERE key = 'L2:fashion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:fashion#3', '복식사', 2870, 3, id, true FROM categories WHERE key = 'L2:fashion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:fashion#4', '액세서리·소재', 2880, 3, id, true FROM categories WHERE key = 'L2:fashion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 생활 규칙·안전 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:daily-rule#1', '재난·안전 수칙', 2890, 3, id, true FROM categories WHERE key = 'L2:daily-rule' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:daily-rule#2', '생활 법규', 2900, 3, id, true FROM categories WHERE key = 'L2:daily-rule' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:daily-rule#3', '우편·번호 체계', 2910, 3, id, true FROM categories WHERE key = 'L2:daily-rule' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:daily-rule#4', '신고·응급 번호', 2920, 3, id, true FROM categories WHERE key = 'L2:daily-rule' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 반려동물·원예 (4개)
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:pets-garden#1', '개 품종', 2930, 3, id, true FROM categories WHERE key = 'L2:pets-garden' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:pets-garden#2', '고양이 품종', 2940, 3, id, true FROM categories WHERE key = 'L2:pets-garden' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:pets-garden#3', '반려동물 관리', 2950, 3, id, true FROM categories WHERE key = 'L2:pets-garden' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:pets-garden#4', '화초·원예', 2960, 3, id, true FROM categories WHERE key = 'L2:pets-garden' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- ── 5. ★ 통계용 뷰
--   ★ 소분류 id 하나만 저장해도 어느 계층으로든 집계할 수 있게 한다.
--   guide 40절이 요구하는 "카테고리별 성적" 이 이 뷰로 계산된다.
CREATE OR REPLACE VIEW category_tree AS
SELECT
  leaf.id            AS category_id,
  leaf.key           AS leaf_key,
  leaf.name_ko       AS sub_name,
  mid.id             AS mid_id,
  mid.key            AS mid_key,
  mid.name_ko        AS mid_name,
  major.id           AS major_id,
  major.key          AS major_key,
  major.name_ko      AS major_name,
  leaf.is_active     AS leaf_active
FROM categories leaf
JOIN categories mid   ON leaf.parent_id = mid.id
JOIN categories major ON mid.parent_id = major.id
WHERE leaf.level = 3;

-- ★ 사용 예 (통계 단위는 대분류가 기본, 중분류가 상세다)
--   SELECT t.major_name, count(*) FROM questions q
--     JOIN category_tree t ON q.category_id = t.category_id
--    WHERE q.status = 'approved' AND q.is_active
--    GROUP BY t.major_name ORDER BY t.major_name;

-- 생성 시각: 2026-09-09T07:25:44.415Z
-- 트리 규모: 대분류 7 / 중분류 63 / 소분류 296
