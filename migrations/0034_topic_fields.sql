-- =============================================================================
-- 0034. ★★★ 제시어 데이터 칸 · 주제 범위 · 라이어 모드 · 캐치마인드 힌트 기록 (R088 · D-345 · docs/18 §12 · §9 scope) — 더하기만
--
-- ① topic_items.fool  — 라이어 바보형에서 라이어가 받는 단어 2~3(jsonb 문자열 배열 · 없으면 null)
--    topic_items.era   — 'classic' | 'modern' | null
--    topic_items.sub   — 소분류(자유 글)
--    topic_items.diff  — 1 쉬움 · 2 보통 · 3 어려움 · null(캐치마인드 섞기에서는 2 로 본다)
-- ② topic_sets.scope   — 주제 이름 아래 한 줄 "정답 범위"(테스트 1 제보 #116~118 · 없으면 안 보임)
-- ③ liar_rounds.mode · fool_word — 'basic' | 'fool' · 바보형에서 라이어가 받은 단어
-- ④ draw_rounds.hints  — R087 출제자 힌트({ length?, initial?, topic? } · 없으면 null)
-- ★ 적재 = scripts/topics-load.mjs 가 네 칸 + scope 를 올린다(파일에 없으면 null).
-- ★ 되돌리기:
--   ALTER TABLE topic_items DROP COLUMN IF EXISTS fool, DROP COLUMN IF EXISTS era, DROP COLUMN IF EXISTS sub, DROP COLUMN IF EXISTS diff;
--   ALTER TABLE topic_sets DROP COLUMN IF EXISTS scope;
--   ALTER TABLE liar_rounds DROP COLUMN IF EXISTS mode, DROP COLUMN IF EXISTS fool_word;
--   ALTER TABLE draw_rounds DROP COLUMN IF EXISTS hints;
-- =============================================================================

ALTER TABLE topic_items ADD COLUMN IF NOT EXISTS fool jsonb;
ALTER TABLE topic_items ADD COLUMN IF NOT EXISTS era text;
ALTER TABLE topic_items ADD COLUMN IF NOT EXISTS sub text;
ALTER TABLE topic_items ADD COLUMN IF NOT EXISTS diff smallint;
ALTER TABLE topic_items DROP CONSTRAINT IF EXISTS topic_items_era_check;
ALTER TABLE topic_items ADD CONSTRAINT topic_items_era_check CHECK (era IS NULL OR era IN ('classic', 'modern'));
ALTER TABLE topic_items DROP CONSTRAINT IF EXISTS topic_items_diff_check;
ALTER TABLE topic_items ADD CONSTRAINT topic_items_diff_check CHECK (diff IS NULL OR diff BETWEEN 1 AND 3);

ALTER TABLE topic_sets ADD COLUMN IF NOT EXISTS scope text;

ALTER TABLE liar_rounds ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'basic';
ALTER TABLE liar_rounds DROP CONSTRAINT IF EXISTS liar_rounds_mode_check;
ALTER TABLE liar_rounds ADD CONSTRAINT liar_rounds_mode_check CHECK (mode IN ('basic', 'fool'));
ALTER TABLE liar_rounds ADD COLUMN IF NOT EXISTS fool_word text;

ALTER TABLE draw_rounds ADD COLUMN IF NOT EXISTS hints jsonb;
