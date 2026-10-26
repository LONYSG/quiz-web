-- =============================================================================
-- 0026. ★★ 정답 공개 평가 3단계 · 1P · 알가치 열 (R068 — docs/19 §7 · §9)
--
-- ★ 찬종(2026-10-26): "어차피 글까지 써 주는 사람은 없더라 · 정답 공개 시간에만 방금 문제 어땠냐고 3단계로 묻고 1P · 자세한 의견은 제보란"
--   "정답 공개 시간 외에 평가한 문제들은 포인트 안 준다"
-- ① question_feedback.vote — 👍 1 · 😐 0 · 👎 −1 (옛 1 · −1 은 그대로 뜻이 같다)
-- ② at_reveal — 표가 들어온 순간 그 방이 정답 공개 중(QUESTION_RESOLVED)이고 그 문항이 현재 문항이었나(서버가 판단)
-- ③ rate_grant_id — 공개 중 평가 1P 지급(point_grants reason 'rate') · 있으면 다시 주지 않는다(같은 문항 두 번 없음)
-- ④ point_grants reason 'rate' · ref_type 'question_feedback'(이미 있음)
-- ⑤ questions.worth — 알가치 1~3(docs/19 §9 · 값은 GEN G025 가 넣는다 · 이 라운드는 열만 · 코드는 읽지 않는다)
-- ★ 옛 안(1~5 난이도 설문 · question_difficulty_votes · survey_panel)은 만들지 않는다.
-- =============================================================================

ALTER TABLE question_feedback DROP CONSTRAINT IF EXISTS question_feedback_vote_check;
ALTER TABLE question_feedback ADD CONSTRAINT question_feedback_vote_check CHECK (vote IN (-1, 0, 1));
ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS at_reveal boolean NOT NULL DEFAULT false;
ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS rate_grant_id bigint REFERENCES point_grants(id) ON DELETE SET NULL;

ALTER TABLE point_grants DROP CONSTRAINT IF EXISTS point_grants_reason_check;
ALTER TABLE point_grants ADD CONSTRAINT point_grants_reason_check
  CHECK (reason IN ('feedback_adopted', 'feedback_monthly_top', 'admin', 'signup', 'rate'));

ALTER TABLE questions ADD COLUMN IF NOT EXISTS worth smallint CHECK (worth IS NULL OR worth BETWEEN 1 AND 3);
