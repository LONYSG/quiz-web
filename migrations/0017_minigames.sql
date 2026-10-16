-- =============================================================================
-- 0017. ★★★ 미니게임 기록 · 보상 · 경험(퀴즈류용) · 기기 종류 (R050 / D-232 · D-234) — 표·열 추가만 (questions 는 건드리지 않는다)
--
-- ★ 찬종: "플레이 기록은 다양하게 보존해두자." (docs/17 3절 — 지우지 않고 세밀하게 · 나중에 포인트 소급 · 업적 · 통계)
--   minigame_runs     — 미니게임 한 판(게임 id · 방 · 미니게임 키 · 연습 여부 · 몇 번째 문제 뒤 · 시드 · 시작/끝)
--   minigame_players  — 그 판의 참가자(기기 종류 · 최종 순위 · 판 점수 합 · 보상)
--   minigame_rounds   — 판 안의 라운드(번호 · 항목/패턴 키 · 공개 설정 jsonb · 시드)
--   minigame_results  — 참가자별 라운드 결과(입력 원값 jsonb · 값 · 오차 · 걸린 ms · 순위 · 판 점수 · 제출 여부)
--   minigame_rewards  — ★★ 보상(돈이다): (run_id, account_id) UNIQUE — 재접속 · 서버 재시작 · 중복 이벤트로 두 번 지급되지 않는다.
--                        연습 판(practice)은 넣지 않는다. 포인트 = 맞힌 문제 + 이 표의 합 − 쓴 포인트.
--   minigame_item_experiences — 퀴즈류 미니게임(R052~)의 경험 기록 — 공개 순간 그 자리에 있던 사람에게. 이번 두 게임은 쓰지 않는다(틀만).
--   game_players.device — 게임 시작 때 참가자의 기기 종류('pc' | 'mobile' — 클라이언트가 알린 값 · 판정에 쓰지 않는다)
-- =============================================================================

CREATE TABLE IF NOT EXISTS minigame_runs (
  id                   bigserial   PRIMARY KEY,
  game_id              bigint      REFERENCES games(id) ON DELETE SET NULL,
  room_id              text        NOT NULL,
  minigame_key         text        NOT NULL,
  practice             boolean     NOT NULL DEFAULT false,
  after_question_index integer,
  seed                 bigint      NOT NULL,
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  -- completed : 끝까지 · force_ended : 방장 강제 종료 · abandoned : 방이 사라짐 · server_restart
  end_reason           text
);
CREATE INDEX IF NOT EXISTS minigame_runs_game_idx ON minigame_runs (game_id);

CREATE TABLE IF NOT EXISTS minigame_players (
  run_id        bigint      NOT NULL REFERENCES minigame_runs(id) ON DELETE CASCADE,
  account_id    bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device        text,
  color_index   smallint,
  final_rank    smallint,
  total_points  integer,
  reward        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, account_id)
);

CREATE TABLE IF NOT EXISTS minigame_rounds (
  run_id       bigint      NOT NULL REFERENCES minigame_runs(id) ON DELETE CASCADE,
  round_index  integer     NOT NULL,
  item_key     text,
  params       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  seed         bigint,
  started_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, round_index)
);

CREATE TABLE IF NOT EXISTS minigame_results (
  run_id       bigint      NOT NULL REFERENCES minigame_runs(id) ON DELETE CASCADE,
  round_index  integer     NOT NULL,
  account_id   bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  submitted    boolean     NOT NULL,
  input        jsonb,
  value        double precision,
  error        double precision,
  elapsed_ms   integer,
  rank         smallint,
  points       integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, round_index, account_id)
);

CREATE TABLE IF NOT EXISTS minigame_rewards (
  id          bigserial   PRIMARY KEY,
  run_id      bigint      NOT NULL REFERENCES minigame_runs(id) ON DELETE CASCADE,
  account_id  bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount      integer     NOT NULL CHECK (amount > 0),
  rank        smallint    NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, account_id)
);
CREATE INDEX IF NOT EXISTS minigame_rewards_account_idx ON minigame_rewards (account_id);

CREATE TABLE IF NOT EXISTS minigame_item_experiences (
  account_id    bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  minigame_key  text        NOT NULL,
  item_key      text        NOT NULL,
  run_id        bigint      REFERENCES minigame_runs(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, minigame_key, item_key)
);

ALTER TABLE game_players ADD COLUMN IF NOT EXISTS device text;
