-- =============================================================================
-- 0022. ★★ 근접 오답 (R058 / A83 (나) / D-252) — 표 추가만
--
-- ★ 채팅은 DB 에 남기지 않는다(01 9장)의 예외 — **정답에 가까운 틀린 제출만 · 정규화 글만**(원문 아님).
--   가깝다 = 정답 집합 중 하나를 포함 · 포함됨 · 편집 거리 ≤ 2 (shared/src/nearMiss.ts).
-- ★ 봇 · 검사 계정은 남기지 않는다 · 한 판 한 문제 한 사람 최대 5행 · 보관 90일(서버 부팅 때 지움 — bootCleanup).
-- ★ 쓰는 곳: 복수정답 보강 근거(GEN 이 변형 추가 — npm run answers:near). 판정에는 쓰지 않는다.
-- =============================================================================

CREATE TABLE IF NOT EXISTS near_misses (
  id           bigserial   PRIMARY KEY,
  question_id  bigint      NOT NULL REFERENCES questions(id),
  account_id   bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  game_id      bigint      REFERENCES games(id) ON DELETE SET NULL,
  normalized   text        NOT NULL CHECK (char_length(normalized) BETWEEN 1 AND 40),
  nearest      text        NOT NULL,
  distance     smallint    NOT NULL CHECK (distance >= 0),
  kind         text        NOT NULL CHECK (kind IN ('contains', 'contained', 'edit')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS near_misses_question_idx ON near_misses (question_id);
CREATE INDEX IF NOT EXISTS near_misses_created_idx ON near_misses (created_at);
