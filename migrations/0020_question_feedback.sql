-- =============================================================================
-- 0020. ★★★ 문제 평가(설문) (R056 / D-246) — 표 추가만
--
-- ★ 찬종(2026-10-21): "문제마다 별로인 문제 평가 버튼 … 선택지를 몇개 지정 + 기타 의견란 … 여러명한테 받도록."
-- ★ 한 사람 한 문제 한 평가 — (question_id, account_id) UNIQUE · 나중 것이 이긴다(game_id 는 최근 판).
--   취소는 행 삭제(서버). 사유 코드는 shared/src/feedback.ts 상수 · 의견 ≤200자.
-- ★ 문항 반영은 GEN 몫(npm run feedback:report) — 이 표는 지우지 않는다(17 3절 기록 보존).
-- =============================================================================

CREATE TABLE IF NOT EXISTS question_feedback (
  id           bigserial   PRIMARY KEY,
  question_id  bigint      NOT NULL REFERENCES questions(id),
  account_id   bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  game_id      bigint      REFERENCES games(id) ON DELETE SET NULL,
  vote         smallint    NOT NULL CHECK (vote IN (-1, 1)),
  reasons      text[]      NOT NULL DEFAULT '{}',
  comment      text        CHECK (comment IS NULL OR char_length(comment) <= 200),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, account_id)
);
CREATE INDEX IF NOT EXISTS question_feedback_question_idx ON question_feedback (question_id);
