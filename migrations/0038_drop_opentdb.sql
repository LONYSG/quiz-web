-- =============================================================================
-- 0038. ★ 외부 공개 문제집(OpenTDB) 줄 지우기 (R106 · D-363) — 줄 삭제만 · 구조는 그대로
--
-- ★ 찬종(2026-11-19): 공식 배포를 앞두고 자료 저작권 정리 — "안 쓰는 거니까 모든 곳에서 흔적을 지워. db 에서도 지우고."
--   9월에 잠깐 실었던 10문항(R033 에서 모두 꺼짐 · 활성 0)과 그 출처 줄을 지운다.
-- ★ 지우기 전 확인(quizweb · quizweb_dev 같음): 문항 10 · game_questions 9(판 7개 · 2026-09-10 ~ 09-15 시험 판) ·
--   answer_events 14 · question_experiences 4 · question_answers 20 · review_queue 10 · 나머지 0 · question_raw 0.
--   지운 뒤 그 판들은 문항이 하나(또는 둘) 줄어 보인다 — 전적 · 지난 판 문제 목록은 JOIN 이라 깨지지 않는다(R106 보고).
-- ★ 멱등: 줄이 없으면 아무것도 안 한다. 빈 DB(0001 부터 새로 돌림)에도 통과한다.
-- ★ 되돌리기: 백업(ops 메뉴 1 이 적용 전에 뜬다)에서 복원 — 줄 삭제라 SQL 로는 되돌릴 수 없다.
-- =============================================================================

CREATE TEMP TABLE _gone ON COMMIT DROP AS
  SELECT id FROM questions WHERE source_id = 'opentdb';

-- questions(id) 를 CASCADE 없이 가리키는 표부터
DELETE FROM answer_events     WHERE question_id IN (SELECT id FROM _gone);
DELETE FROM game_questions    WHERE question_id IN (SELECT id FROM _gone);
DELETE FROM question_feedback WHERE question_id IN (SELECT id FROM _gone);
DELETE FROM near_misses       WHERE question_id IN (SELECT id FROM _gone);
DELETE FROM play_events       WHERE question_id IN (SELECT id FROM _gone);
UPDATE app_reports SET question_id = NULL WHERE question_id IN (SELECT id FROM _gone);

-- 문항 — question_answers · question_experiences · review_queue · question_choices 는 따라 지워진다(CASCADE)
DELETE FROM questions WHERE id IN (SELECT id FROM _gone);

DELETE FROM question_raw WHERE source_id = 'opentdb';
DELETE FROM sources      WHERE id = 'opentdb';

-- 다른 출처 줄의 설명에 남은 이름 빼기
UPDATE sources SET notes = '개발·테스트용 시드 및 직접 작성 문제.'
 WHERE id = 'manual' AND notes LIKE '%OpenTDB%';
UPDATE sources SET notes = 'R011부터의 주 확보 방식. Gemini API 로 카테고리를 입력해 직접 생성하고 역검증·규칙 검사를 거친다. '
                        || '★ attribution 이 NULL 인 것은 의도된 것이다 — 생성 문제에는 저작자 표시 의무가 없다.'
 WHERE id = 'gemini-gen' AND notes LIKE '%opentdb%';
