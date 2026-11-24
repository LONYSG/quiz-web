-- =============================================================================
-- 0041. ★★★ 혼자 하기(솔로) · 띠 (R118 · docs/24 4-6 · 5절 · 12-2) — 더하기만
--
-- ① solo_runs — 판 하나(맞힌 개수 = 기록 · 끝난 까닭 · 기기 · 자리 · 어려움 표 버전 · 의심 표시)
-- ② solo_answers — 문제마다(등급 · 글 지문 · 보인 때 · 첫 입력까지 · 맞힌 ms · 시간 한도 · 결과 · 틀린 답 글 90일 · 나감)
--    ★ 솔로에서 본 문제는 question_experiences 에 쓰지 않는다(공방의 "본 문제"가 아니다 · 찬종)
-- ③ accounts — 솔로 최고 기록 · 띠 칸(0~24 · NULL = 띠 없음 · 내려가지 않는다) · 띠를 받은 때
-- ④ point_grants — reason 'belt'(띠 · 단계가 오를 때 차액 · 5-5) · ref_type 'solo_run'
--
-- ★ 되돌리기(데이터를 버려도 될 때만):
--   DELETE FROM point_grants WHERE reason = 'belt';  (그 뒤 두 CHECK 를 0030 의 것으로)
--   ALTER TABLE accounts DROP COLUMN solo_best, DROP COLUMN belt_step, DROP COLUMN belt_at;
--   DROP TABLE solo_answers; DROP TABLE solo_runs;
-- =============================================================================

CREATE TABLE IF NOT EXISTS solo_runs (
  id            bigserial   PRIMARY KEY,
  account_id    bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  correct       smallint    NOT NULL DEFAULT 0,
  asked         smallint    NOT NULL DEFAULT 0,
  end_reason    text        CHECK (end_reason IS NULL OR end_reason IN ('lives', 'quit', 'away', 'disconnect', 'server_restart', 'no_questions')),
  device        text        CHECK (device IS NULL OR device IN ('pc', 'mobile')),
  site          text,
  ramp_version  smallint    NOT NULL,
  belt_version  smallint,
  best_before   smallint,
  belt_before   smallint,
  belt_after    smallint,
  is_bot        boolean     NOT NULL DEFAULT false,
  flags         jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS solo_runs_account_idx ON solo_runs (account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS solo_runs_open_idx ON solo_runs (id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS solo_answers (
  run_id       bigint      NOT NULL REFERENCES solo_runs(id) ON DELETE CASCADE,
  n            smallint    NOT NULL,
  question_id  bigint      NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  grade        smallint    NOT NULL,
  text_hash    text,
  shown_at     timestamptz NOT NULL,
  limit_ms     integer     NOT NULL,
  correct      boolean     NOT NULL,
  "end"        text        NOT NULL CHECK ("end" IN ('correct', 'timeout', 'away', 'quit', 'disconnect')),
  ms           integer,
  first_ms     integer,
  wrong_count  smallint    NOT NULL DEFAULT 0,
  wrong_texts  text[],
  away         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, n)
);
CREATE INDEX IF NOT EXISTS solo_answers_question_idx ON solo_answers (question_id);
CREATE INDEX IF NOT EXISTS solo_answers_wrong_idx ON solo_answers (created_at) WHERE wrong_texts IS NOT NULL;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS solo_best smallint NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS belt_step smallint CHECK (belt_step IS NULL OR (belt_step >= 0 AND belt_step <= 24));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS belt_at timestamptz;

ALTER TABLE point_grants DROP CONSTRAINT IF EXISTS point_grants_reason_check;
ALTER TABLE point_grants ADD CONSTRAINT point_grants_reason_check
  CHECK (reason IN ('feedback_adopted', 'feedback_monthly_top', 'admin', 'signup', 'rate', 'team_win', 'belt'));
ALTER TABLE point_grants DROP CONSTRAINT IF EXISTS point_grants_ref_type_check;
ALTER TABLE point_grants ADD CONSTRAINT point_grants_ref_type_check
  CHECK (ref_type IN ('question_feedback', 'game', 'solo_run'));
