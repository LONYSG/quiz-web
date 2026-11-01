-- =============================================================================
-- 0028. ★★ game_questions 등급 · 알가치 기록 (R071 — D-308 제안 · docs/19 §5 · §9)
--
-- ★ R069 선정 코드는 문항마다 "목표 등급 → 실제 등급 · 알가치 · 폴백" 을 서버 로그에만 남겼다(그때 마이그레이션 없음).
--   → 판에 나온 문항의 그때 값을 표에 남겨 보고서가 쓴다(scripts/hint-solve-report.mjs 의 등급 · 알가치 · levelmix 보고).
-- ① target_grade — 그 문항의 계획 등급(game.gradePlan · 난이도 초급/중급/고급의 섞음) · 계획이 없으면(옛 판 · 미니게임만) NULL
-- ② grade — 그때 questions.difficulty_score(1~5) · ③ worth — 그때 questions.worth(1~3 · 판정 전 NULL)
--   → target_grade ≠ grade 이면 폴백(계획 등급이 비어 다른 등급에서 냄)
-- ★ 옛 행은 NULL(보고서는 NULL 이면 지금의 questions 값으로 대신 센다).
-- ★ questions 는 ALTER 하지 않는다(GEN 이 쓰는 표 — worth_kind 는 R072).
-- =============================================================================

ALTER TABLE game_questions ADD COLUMN IF NOT EXISTS target_grade smallint CHECK (target_grade IS NULL OR target_grade BETWEEN 1 AND 5);
ALTER TABLE game_questions ADD COLUMN IF NOT EXISTS grade smallint CHECK (grade IS NULL OR grade BETWEEN 1 AND 5);
ALTER TABLE game_questions ADD COLUMN IF NOT EXISTS worth smallint CHECK (worth IS NULL OR worth BETWEEN 1 AND 3);
