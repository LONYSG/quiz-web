-- =============================================================================
-- 0035. ★★ 주제 추첨 group · 방장 주제 고르기 optIn · 객관식 저장 보기 (R090 · D-347) — 더하기만
--
-- ① topic_sets."group"  — 같은 group 의 세트들은 주제 자동 추첨에서 한 자리(지하철 13 세트 = "metro" · 없으면 null)
-- ② topic_sets.opt_in   — 방장 주제 고르기(라이어 · 캐치마인드)에서 기본 체크 해제("아는 사람만 아는 주제" · 없으면 false)
-- ③ question_choices    — 객관식 5연속의 저장된 오답 보기(정본 data/minigame/choice/options.json · verified 만 · scripts/choice-load.mjs)
-- ★ 적재 = topics-load 가 ① ② 를 · choice-load 가 ③ 을(메뉴 1).
-- ★ 되돌리기:
--   ALTER TABLE topic_sets DROP COLUMN IF EXISTS "group", DROP COLUMN IF EXISTS opt_in;
--   DROP TABLE IF EXISTS question_choices;
-- =============================================================================

ALTER TABLE topic_sets ADD COLUMN IF NOT EXISTS "group" text;
ALTER TABLE topic_sets ADD COLUMN IF NOT EXISTS opt_in boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS question_choices (
  question_id bigint PRIMARY KEY REFERENCES questions (id) ON DELETE CASCADE,
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  round text,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
