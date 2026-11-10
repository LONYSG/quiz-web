-- =============================================================================
-- 0036. ★ 라이어 키워드 맞히기 이의제기 (R091 · D-348) — 더하기만
--
-- ① liar_rounds.appeal — null = 이의제기 없음 · { guess, yes, no, passed }(라이어의 답 · 인정 수 · 기각 수 · 인정됐나)
--    인정된 답은 그 제시어의 변형 후보 → scripts/liar-appeals-report.mjs(npm run liar:appeals · 읽기만)
-- ★ 되돌리기:
--   ALTER TABLE liar_rounds DROP COLUMN IF EXISTS appeal;
-- =============================================================================

ALTER TABLE liar_rounds ADD COLUMN IF NOT EXISTS appeal jsonb;
