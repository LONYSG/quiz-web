-- =============================================================================
-- 0006. 소분류 리프를 현재 트리와 다시 맞춘다 (R019 / 작업 A-1)
--
-- ★★ 왜 필요한가 — 적재 직전에 발견한 어긋남이다.
--   0003 은 2026-09-09 에 적용됐는데, 그 뒤 R012 에서 트리를 더 고쳤고
--   ★ 마이그레이션을 다시 만들어 적용하지 않았다. 그래서 DB 와 categories.ts 가 갈라졌다.
--     · 이름이 다른 리프 4개
--     · ★ DB 에 아예 없는 리프 1개 (L3:religion#6)
--
-- ★★ 이것을 고치지 않고 적재하면 무슨 일이 나는가
--   적재 코드는 리프를 `L3:{midKey}#{순번}` **키로만** 찾는다. 이름은 보지 않는다.
--   ★ 그래서 R018 의 religion/5(고대·소수 종교) 문제 10건이
--     화면에 "종교 의식·상징" 으로 표시되는 리프에 들어갔을 것이다.
--   ★★ 조용히 잘못 분류된다. 오류가 나지 않아 더 위험하다.
--
-- ★ 안전 확인: 이름이 어긋난 리프 4개와 누락된 1개에 **붙어 있는 문제가 하나도 없다.**
--   적용 전에 DB 로 확인했다. 그래서 이름을 바꿔도 기존 문제의 분류가 흔들리지 않는다.
--
-- ★ 0003 을 고치지 않는다. 이미 적용된 마이그레이션이다. 교정은 새 파일로 한다.
-- ★ 이 파일도 scripts/gen-migration-0003.mjs 와 같은 형식으로 생성했다 (D-046).
--   정본은 pipeline/src/categories.ts 다.
-- =============================================================================

-- 한국 방송·예능
--   ★ 이름 교정: L3:kr-tv#4  "라디오·성우" → "라디오 방송"
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:kr-tv#4', '라디오 방송', 330, 3, id, true FROM categories WHERE key = 'L2:kr-tv' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 종교·경전 상식
--   ★ 이름 교정: L3:religion#4  "기타 종교·종파" → "힌두교·유대교"
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#4', '힌두교·유대교', 650, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
--   ★ 이름 교정: L3:religion#5  "종교 의식·상징" → "고대·소수 종교"
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#5', '고대·소수 종교', 660, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
--   ★ 신규: L3:religion#6 = 종교 의식·상징
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:religion#6', '종교 의식·상징', 670, 3, id, true FROM categories WHERE key = 'L2:religion' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- e스포츠·비디오게임
--   ★ 이름 교정: L3:esports#4  "e스포츠 대회·선수" → "e스포츠 대회·리그"
INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:esports#4', 'e스포츠 대회·리그', 2560, 3, id, true FROM categories WHERE key = 'L2:esports' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- ★ 생성 시각: 2026-09-17T01:27:21.295Z
-- ★ 이름 교정 4건 / 신규 1건
