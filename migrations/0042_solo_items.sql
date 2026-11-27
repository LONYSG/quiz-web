-- =============================================================================
-- 0042. ★★ 혼자 하기 아이템 · 넘기기 (R123 · 찬종 2026-11-27) — 더하기만
--
-- ① solo_answers."end" 에 'skip'(넘기기 — 목숨 안 깎음 · 맞힌 수에 안 셈) · items = 그 문제에 쓴 아이템('hint' · 'initial' · 'skip')
-- ② solo_runs.items = 판의 아이템 기록 { bought: {hint, initial, skip}, used: {…}, spent, refunded }
--    값은 point_spends(reason 'solo-item' · ref 'solo_run:<id>') 한 줄 — 판이 끝나면 쓴 만큼으로 고친다(안 쓴 것 돌려줌 · 0 이면 줄을 지움)
--
-- ★ 되돌리기(데이터를 버려도 될 때만):
--   DELETE FROM solo_answers WHERE "end" = 'skip';
--   ALTER TABLE solo_answers DROP CONSTRAINT solo_answers_end_check;
--   ALTER TABLE solo_answers ADD CONSTRAINT solo_answers_end_check CHECK ("end" IN ('correct', 'timeout', 'away', 'quit', 'disconnect'));
--   ALTER TABLE solo_answers DROP COLUMN items; ALTER TABLE solo_runs DROP COLUMN items;
-- =============================================================================

ALTER TABLE solo_answers DROP CONSTRAINT IF EXISTS solo_answers_end_check;
ALTER TABLE solo_answers ADD CONSTRAINT solo_answers_end_check CHECK ("end" IN ('correct', 'timeout', 'away', 'quit', 'disconnect', 'skip'));
ALTER TABLE solo_answers ADD COLUMN IF NOT EXISTS items text[];
ALTER TABLE solo_runs ADD COLUMN IF NOT EXISTS items jsonb;
