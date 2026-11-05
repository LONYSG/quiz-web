-- =============================================================================
-- 0029. ★★ 평가 요청 문항을 영구 기록 (R074 §F ③ · R071 7절 ② — D-313 이어서)
--
-- ★ R071 은 "그 문항이 그 판의 평가 요청 문항(무작위 1/3)이었나" 를 서버 **메모리**(rateAsk.ts · 최근 500판)로만 알았다
--   → 서버를 다시 켜면 그 전 판의 결과 화면 · 로비 표는 asked = false 로 들어갔다(0027 주석).
-- ★ 이제 문제를 시작할 때(game_questions 를 넣을 때) rate_ask 를 같이 적는다 — 서버가 요청을 뽑은 그 값.
--   · 서버: 메모리에 없으면 이 칸을 읽어 question_feedback.asked 를 정한다(feedbackRoutes)
--   · 보고서: scripts/feedback-report.mjs 가 asked = f.asked OR gq.rate_ask 로 읽는다
-- ★ 옛 행은 false(그때 기록이 없다 — R071 전에는 모든 문항이 요청이었다 · 보고서는 created_at 으로 나눈다).
-- ★ 추가만(ALTER ADD COLUMN · 기본 false) — 되돌리기: ALTER TABLE game_questions DROP COLUMN rate_ask;
-- =============================================================================

ALTER TABLE game_questions ADD COLUMN IF NOT EXISTS rate_ask boolean NOT NULL DEFAULT false;
