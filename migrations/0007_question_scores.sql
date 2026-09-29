-- =============================================================================
-- 0007. 문제에 세 점수 + 근거를 저장한다 (R024 / Q-100 확정)
--
-- ★★ 왜
--   지금 DB 에는 난이도 3단계(easy/medium/hard)만 있다. 접근성·알 가치가 없어서
--   출제 선별 기준(D-044 — 접근성 1 제외 / 접근성 2 는 출제의 5% 이내 / 알 가치 3 미만 제외)을
--   게임이 걸 수 없었다 (R023 발견: 접근성 1 인 17건 활성, 접근성 2 가 11.7%).
--
-- ★★ 근거 열을 따로 두는 이유
--   R019~R022 에서 점수가 흔들렸는데 숫자만 남아 왜 그런지 알 수 없었다 (Q-98).
--   근거 한 줄("중학 과학", "대중적 애니 제목")이 있으면 흔들림이 보인다.
--
-- ★ difficulty(3단계) 열은 그대로 둔다 — 서버가 쓰고 있다. difficulty_score 는 1~5 원점수다.
-- ★ inactive_reason: is_active 를 내린 사유. 지우지 않고 내린다 (D-051 — 자동 단계는 폐기하지 않는다).
-- =============================================================================

ALTER TABLE questions
  ADD COLUMN accessibility      smallint CHECK (accessibility BETWEEN 1 AND 5),
  ADD COLUMN accessibility_why  text,
  ADD COLUMN difficulty_score   smallint CHECK (difficulty_score BETWEEN 1 AND 5),
  ADD COLUMN difficulty_why     text,
  ADD COLUMN worth_knowing      smallint CHECK (worth_knowing BETWEEN 1 AND 5),
  ADD COLUMN worth_why          text,
  ADD COLUMN score_version      text,
  ADD COLUMN scored_at          timestamptz,
  ADD COLUMN inactive_reason    text;

COMMENT ON COLUMN questions.accessibility     IS '접근성 1~5 — 분야(중분류)를 한국 성인이 아는가. docs/15-QUALITY-STANDARD.md 5-3';
COMMENT ON COLUMN questions.difficulty_score  IS '난이도 1~5 — 이 사실을 어디서 접하는가(교과 단계·접하는 곳). 5-1';
COMMENT ON COLUMN questions.worth_knowing     IS '알 가치 1~5 — 몰랐다가 알게 되면 "아 그렇구나" 가 되는가. 5-2';
COMMENT ON COLUMN questions.score_version     IS '채점 기준 버전 (예: score-v1)';
COMMENT ON COLUMN questions.inactive_reason   IS 'is_active=false 로 내린 사유';

-- 출제 선별에 쓰는 인덱스
CREATE INDEX questions_select_idx ON questions (is_active, accessibility, worth_knowing);
