-- =============================================================================
-- 0021. ★★★ 미니게임만 모드 (R057 / D-249) — games 에 칸 둘
--
-- ★ 찬종(2026-10-21): "미니게임만 하는 모드도 추가하면 좋을듯."
-- ★ mode = 'quiz'(지금까지 전부) | 'minigame'(문제 없이 미니게임 N개). 옛 행은 'quiz'.
--   setting_minigame_rounds = 미니게임만일 때 N(2~10) · 퀴즈 판은 null.
-- ★ 미니게임만 판은 game_questions · answer_events 0 행 · setting_question_count = planned_question_count = 0.
--   미니게임 기록(minigame_runs · players · results · rewards)은 퀴즈 판의 미니게임과 같은 표에 game_id 로 붙는다.
-- =============================================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'quiz';
ALTER TABLE games ADD COLUMN IF NOT EXISTS setting_minigame_rounds smallint;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_mode_check') THEN
    ALTER TABLE games ADD CONSTRAINT games_mode_check CHECK (mode IN ('quiz', 'minigame'));
  END IF;
END $$;
