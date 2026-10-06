-- =============================================================================
-- 0011. 소분류 추가 — 세계 영화 > 해외 드라마 (R037 / Q-107 건우 확정)
--
-- ★ 정본은 pipeline/src/categories.ts 다 (world-cinema subs 의 7번째). 리프 key 는 순번 — L3:world-cinema#7.
-- ★ game_topic 은 비워 둔다 — 중분류 L2:world-cinema 의 묶음(미디어·콘텐츠)을 category_game_topics 뷰가 물려준다 (0009).
-- ★ 다시 돌려도 된다 (ON CONFLICT). 붙어 있는 문제는 아직 없다 — R037 미디어 200 은 적재하지 않았다.
-- =============================================================================

INSERT INTO categories (key, name_ko, sort_order, level, parent_id, is_active) SELECT 'L3:world-cinema#7', '해외 드라마', 1970, 3, id, true FROM categories WHERE key = 'L2:world-cinema' ON CONFLICT (key) DO UPDATE SET name_ko = EXCLUDED.name_ko, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;
