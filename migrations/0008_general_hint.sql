-- =============================================================================
-- 0008. 일반 힌트 저장 칸 (R028 / Q-104)
--
-- ★★ 왜
--   건우: "아무도 모르는 문제가 떠 있으면 멍때리기 or 마구잡이로 찍기밖에 안 된다.
--         플레이 관점에서 집중도를 높이기 위해 난이도 '상' 인 문제만 힌트를 달자."
--   ★ 게임은 **남은 20초**에 일반 힌트를, **남은 10초**에 초성 힌트를 보여 준다.
--
-- ★ 어느 문제에 힌트를 달지는 GEN 이 정한다 (hint-v1 / hint-check).
--   ★★ 게임은 "힌트가 있으면 보여 준다" 뿐이다. 난이도로 표시 여부를 가르지 않는다.
--
-- ★ 형식
--   general_hint          text  — 화면에 그대로 보일 한 문장. NULL = 힌트 없음
--                                 ★ 빈 문자열·공백만은 금지 (NULL 과 헷갈린다)
--                                 ★ 길이 상한 120자 — 한 화면 게이트(게임 1.00배)를 지키려면 두 줄 안이어야 한다
--   general_hint_version  text  — 만든 기준 (예: 'hint-v1'). 힌트가 있으면 반드시 있어야 한다
--
-- ★ 기존 문제는 전부 NULL 로 시작한다. 채우는 것은 GEN 의 적재 스크립트다.
-- =============================================================================

ALTER TABLE questions
  ADD COLUMN general_hint         text,
  ADD COLUMN general_hint_version text;

ALTER TABLE questions
  ADD CONSTRAINT questions_general_hint_nonblank
    CHECK (general_hint IS NULL OR length(btrim(general_hint)) > 0),
  ADD CONSTRAINT questions_general_hint_len
    CHECK (general_hint IS NULL OR char_length(general_hint) <= 120),
  ADD CONSTRAINT questions_general_hint_versioned
    CHECK (general_hint IS NULL OR general_hint_version IS NOT NULL);

COMMENT ON COLUMN questions.general_hint IS
  '일반 힌트 (남은 20초에 표시). NULL = 없음. 1~120자. 어느 문제에 둘지는 GEN 이 정한다 (R028 / Q-104)';
COMMENT ON COLUMN questions.general_hint_version IS
  '일반 힌트를 만든 기준 (예: hint-v1). general_hint 가 있으면 필수';
