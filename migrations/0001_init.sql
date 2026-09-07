-- =============================================================================
-- 0001_init.sql  초기 스키마
--
-- 출처: R002 3장(문제 데이터 구조) + R003 4장(게임/계정 스키마)
-- 관련 문서: docs/03-DATA-MODEL.md
--
-- 소유 관계 (docs/03-DATA-MODEL.md와 일치시킬 것)
--   게임 서버가 읽고 쓰는 것 : accounts sessions rooms games game_players
--                              game_questions question_experiences answer_events
--   게임 서버가 읽기만 하는 것: questions question_answers categories
--   파이프라인 전용           : sources question_raw review_queue
--                              (+ questions, question_answers 에 쓰기)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 출처 / 카테고리
-- -----------------------------------------------------------------------------

-- 문제의 출처와 라이선스. Q-41(CC BY-SA 4.0 의무 수용)의 근거 테이블이다.
-- 문제별로 라이선스를 추적할 수 있어야 여러 소스를 한 DB에 섞어도
-- share-alike가 다른 출처의 문제까지 번지지 않는다.
CREATE TABLE sources (
  id          text        PRIMARY KEY,          -- 'opentdb' | 'wikidata' | 'manual' | 'etri'
  name        text        NOT NULL,
  url         text,
  license     text        NOT NULL,             -- 'CC-BY-SA-4.0' | 'CC0-1.0' | 'proprietary'
  attribution text,                             -- 화면·문서에 표기할 출처 문구 전문
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 카테고리를 문자열이 아니라 테이블로 두는 이유:
-- guide 40절이 카테고리별 성적 통계를 요구하고 52절이 카테고리 선택/제외를 확장 후보로 든다.
-- 문자열로 박아두면 이름을 바꿀 때 과거 통계가 깨진다.
CREATE TABLE categories (
  id         smallserial PRIMARY KEY,
  key        text        NOT NULL UNIQUE,       -- 'general' | 'history' | ...
  name_ko    text        NOT NULL,
  sort_order smallint    NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- 2. 문제 (R002 3장)
-- -----------------------------------------------------------------------------

-- 소스 원본 보관. 가공 규칙이나 프롬프트가 바뀌면 원본에서 다시 돌린다.
-- 원본을 버리면 소스를 다시 긁어야 하는데 OpenTDB는 전량 수확에 약 12분이 걸린다.
CREATE TABLE question_raw (
  id             bigserial   PRIMARY KEY,
  source_id      text        NOT NULL REFERENCES sources(id),
  source_ref     text        NOT NULL,          -- 소스 내 고유 식별자
  payload        jsonb       NOT NULL,          -- 소스 원본 전체
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  process_status text        NOT NULL DEFAULT 'pending'
                 CHECK (process_status IN ('pending', 'filtered_out', 'processed', 'error')),
  UNIQUE (source_id, source_ref)
);

CREATE TABLE questions (
  id             bigserial   PRIMARY KEY,

  -- 지금은 'short_answer' 하나만 사용한다. 객관식/이미지/초성 퀴즈는 guide 51절 금지 기능이며
  -- 확장 시 이 값이 늘어난다. 컬럼만 미리 두어 기존 데이터의 마이그레이션을 없앤다.
  question_type  text        NOT NULL DEFAULT 'short_answer',

  question_text  text        NOT NULL,
  display_answer text        NOT NULL,          -- 정답 공개 화면용 대표 표기 (판정에 쓰지 않음)
  hint_answer    text,                          -- 힌트 생성 기준. NULL이면 display_answer 사용
  answer_lang    text        NOT NULL DEFAULT 'ko'
                 CHECK (answer_lang IN ('ko', 'en', 'mixed')),
  category_id    smallint    NOT NULL REFERENCES categories(id),
  difficulty     text        NOT NULL DEFAULT 'medium'
                 CHECK (difficulty IN ('easy', 'medium', 'hard')),
  explanation    text,                          -- guide 21절 해설

  source_id      text        NOT NULL REFERENCES sources(id),
  source_ref     text,
  license        text,                          -- 소스 기본값을 복사해 문제 단위로 고정

  -- status(승인 여부)와 is_active(현재 노출 여부)는 다른 축이다.
  -- 승인된 문제라도 품질 문제가 발견되면 빼야 하는데, status를 rejected로 되돌리면
  -- 검수 이력이 오염된다.
  status         text        NOT NULL DEFAULT 'pending_review'
                 CHECK (status IN ('pending_review', 'approved', 'rejected')),
  is_active      boolean     NOT NULL DEFAULT true,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  approved_at    timestamptz
);

-- 출제 대상 조회: status='approved' AND is_active AND question_type='short_answer'
CREATE INDEX questions_pool_idx ON questions (status, is_active, category_id);
CREATE INDEX questions_source_idx ON questions (source_id, source_ref);
-- 같은 소스의 같은 문제를 두 번 적재하지 않는다. 시드/파이프라인 재실행을 안전하게 만든다.
CREATE UNIQUE INDEX questions_source_ref_uidx ON questions (source_id, source_ref)
  WHERE source_ref IS NOT NULL;

-- 복수 정답 (guide 17절).
-- 배열 컬럼이 아니라 별도 테이블로 두는 이유:
--  (a) answer_norm UNIQUE로 "정규화하면 같아지는 중복 변형"을 DB가 막아준다
--  (b) 표기 변형 추가/삭제가 자주 일어나는 작업이라 행 단위 관리가 낫다
--  (c) note로 검수 맥락을 남길 수 있다
CREATE TABLE question_answers (
  id          bigserial PRIMARY KEY,
  question_id bigint    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text text      NOT NULL,               -- 사람이 읽는 원문 표기
  answer_norm text      NOT NULL,               -- shared/normalizeAnswer() 결과를 미리 저장
  is_primary  boolean   NOT NULL DEFAULT false, -- display_answer 와 같은 항목
  note        text,
  UNIQUE (question_id, answer_norm)
);

CREATE INDEX question_answers_qid_idx  ON question_answers (question_id);
CREATE INDEX question_answers_norm_idx ON question_answers (answer_norm);

-- 검수 큐 (파이프라인 전용). 게임 서버는 이 테이블을 전혀 읽지 않는다.
CREATE TABLE review_queue (
  question_id      bigint      PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  ai_model         text,
  ai_confidence    real,
  ai_flags         jsonb,                       -- convertible/uniqueAnswer/krAccessible/koreanTerm
  backcheck_answer text,
  backcheck_result text        CHECK (backcheck_result IN ('pass', 'mismatch', 'ambiguous', 'skipped')),
  rule_flags       jsonb,                       -- 정답 노출, 중복 등 규칙 검사 결과
  reviewer_note    text,
  reviewed_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 3. 계정 / 세션 (R003 4-1)
-- -----------------------------------------------------------------------------

CREATE TABLE accounts (
  id            bigserial   PRIMARY KEY,

  -- 아이디는 대소문자를 구분하지 않고 유일하게 한다(소문자 정규화 저장).
  -- 화면에 표시되지 않으므로 구분할 이유가 없고, 대소문자를 틀려 로그인 실패하는 것은
  -- 순수한 불편이다. (R003 6-1 자체 판단, 승인됨)
  login_id      text        NOT NULL UNIQUE,

  -- argon2id 해시. 최소 4자 (Q-04 개정: 고정 URL 포기로 브라우저 자동완성이 안 되므로 완화).
  -- 상한 72바이트 유지.
  password_hash text        NOT NULL,

  -- 닉네임은 전역 유일이며 대소문자를 구분한다 (guide 3절, Q-05).
  -- PostgreSQL의 text UNIQUE는 기본적으로 대소문자를 구분하므로 별도 처리가 필요 없다.
  -- citext나 lower() 인덱스를 쓰면 오히려 규칙을 깨뜨린다.
  nickname      text        NOT NULL UNIQUE,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 쿠키에는 랜덤 토큰 원본을 담고 DB에는 해시만 저장한다.
-- DB가 유출되어도 세션을 탈취할 수 없게 한다.
CREATE TABLE sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash   text        NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  -- 30일 슬라이딩 갱신을 매 요청마다 하지 않는다. 남은 기간이 절반(15일) 미만일 때만 갱신한다.
  -- 이유: 매 요청 UPDATE는 DB 쓰기를 폭증시키고 DB를 계속 깨워 둔다.
  -- 현재는 로컬 DB지만 클라우드 전환 대비 규칙으로 유지한다. (R004 0장)
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text
);

CREATE INDEX sessions_account_idx ON sessions (account_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- -----------------------------------------------------------------------------
-- 4. 방 (R003 4-2)
-- -----------------------------------------------------------------------------

-- 방 레코드만 DB에 두고, 참가자 목록과 진행 중 게임 상태는 서버 메모리에만 둔다.
-- guide 48절이 이 조합을 명시적으로 허용한다.
--
-- 방을 DB에 두는 이유:
--  (1) guide 49절이 "존재하지 않는 방"과 "이미 종료된 방"을 다르게 안내하라고 요구한다
--  (2) Q-14의 "1인당 동시 보유 방 1개"를 부분 UNIQUE 인덱스로 DB가 강제할 수 있다
--  (3) games가 room_id를 참조해야 게임 이력이 방과 연결된다
CREATE TABLE rooms (
  id              text        PRIMARY KEY,       -- 초대 링크에 들어가므로 추측 불가한 랜덤 문자열
  title           text        NOT NULL,
  host_account_id bigint      NOT NULL REFERENCES accounts(id),  -- 생성 당시 방장(이전되어도 갱신 안 함)
  created_by      bigint      NOT NULL REFERENCES accounts(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);

-- Q-14: 1인당 동시 보유 방 1개를 DB가 강제한다.
-- ★ 이 제약 때문에 서버 부팅 시 정리 절차가 반드시 필요하다.
--   프로세스가 죽으면 closed_at이 NULL인 방이 DB에 남고, 메모리에는 없으므로 영원히 닫히지 않아
--   그 사람은 다시 방을 만들 수 없게 된다.
--   로컬 PC 서버는 껐다 켜는 것이 일상이므로 이 문제가 반드시, 자주 발생한다.
--   → server/src/db/bootCleanup.ts 참조 (R004 D-3)
CREATE UNIQUE INDEX rooms_one_open_per_owner_idx
  ON rooms (created_by) WHERE closed_at IS NULL;

CREATE INDEX rooms_closed_idx ON rooms (closed_at);

-- -----------------------------------------------------------------------------
-- 5. 게임 (R003 4-3)
-- -----------------------------------------------------------------------------

CREATE TABLE games (
  id                     bigserial   PRIMARY KEY,
  room_id                text        NOT NULL REFERENCES rooms(id),
  started_at             timestamptz NOT NULL DEFAULT now(),
  ended_at               timestamptz,

  -- completed      : 설정한 문제 수를 모두 진행 (guide 38절)
  -- force_ended    : 방장 강제 종료 (guide 25절, Q-31)
  -- no_questions   : 출제 가능 문제 소진으로 조기 종료 (Q-22)
  -- abandoned      : PAUSED 30분 초과 (Q-30 개정, R004 0장)
  -- server_restart : 서버 프로세스 재시작으로 이어하기 불가 (R004 D-3)
  end_reason             text        CHECK (end_reason IN
                           ('completed', 'force_ended', 'no_questions', 'abandoned', 'server_restart')),

  setting_question_count int         NOT NULL,
  setting_start_mode     text        NOT NULL CHECK (setting_start_mode IN ('instant', 'countdown')),
  setting_countdown_sec  int,
  planned_question_count int         NOT NULL,   -- 시작 시점 출제 가능 수 검증 결과 (Q-21)
  ended_question_count   int                     -- 실제로 출제된 문제 수
);

CREATE INDEX games_room_idx    ON games (room_id);
CREATE INDEX games_started_idx ON games (started_at);
CREATE INDEX games_open_idx    ON games (ended_at) WHERE ended_at IS NULL;

CREATE TABLE game_players (
  game_id          bigint      NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  account_id       bigint      NOT NULL REFERENCES accounts(id),
  color_index      smallint    NOT NULL,          -- guide 35절 플레이어 색상
  joined_at        timestamptz NOT NULL DEFAULT now(),  -- 중간 참가 판별 (guide 32절)
  is_midgame_join  boolean     NOT NULL DEFAULT false,

  -- ★ 게임 진행 중에는 이 값을 UPDATE하지 않는다.
  --   점수는 answer_events로부터 완전히 계산할 수 있고, 문제마다 UPDATE하면
  --   같은 정보를 두 번 쓰는 것이 된다. 종료 시 한 번 확정 값을 넣는다(의도적 비정규화).
  final_score      int,
  final_rank       smallint,                      -- 동점 공동 순위 (guide 39절)
  connected_at_end boolean,

  PRIMARY KEY (game_id, account_id)
);

CREATE INDEX game_players_account_idx ON game_players (account_id);

CREATE TABLE game_questions (
  game_id           bigint      NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  question_index    smallint    NOT NULL,          -- 1-based
  question_id       bigint      NOT NULL REFERENCES questions(id),
  epoch             int         NOT NULL,          -- 문제 세대 번호 (R003 2-3 장치 B). 사후 추적용
  started_at        timestamptz NOT NULL,
  resolved_at       timestamptz,

  -- correct   : 정답자 발생
  -- timeout   : 30초 경과
  -- skip_vote : 일반 스킵 투표 통과
  -- host_skip : 방장 강제 스킵
  -- aborted   : 정답을 공개하지 않고 중단됨 (강제 종료 / abandoned / server_restart)
  --             ★ aborted 인 문제는 경험 기록을 남기지 않는다 (Q-25, Q-47)
  resolution        text        CHECK (resolution IN
                      ('correct', 'timeout', 'skip_vote', 'host_skip', 'aborted')),

  winner_account_id bigint      REFERENCES accounts(id),
  skip_votes_at_end smallint,
  active_at_end     smallint,                      -- 해결 시점 활성 인원 (스킵 임계값 사후 검증)

  PRIMARY KEY (game_id, question_index),
  -- 한 게임 안에서 같은 문제를 두 번 출제하지 않는다. DB가 강제한다.
  UNIQUE (game_id, question_id)
);

CREATE INDEX game_questions_qid_idx     ON game_questions (question_id);
CREATE INDEX game_questions_winner_idx  ON game_questions (winner_account_id);

-- -----------------------------------------------------------------------------
-- 6. 문제 경험 (guide 26절의 장기 자산)
-- -----------------------------------------------------------------------------

-- ★ 기록 기준 (Q-23/24/47 최종): "정답이 공개되는 순간 그 자리에 있었던 사람 전원"
--    · 정답자 발생 / 시간 종료 / 스킵 - 세 경로 모두 정답 공개이며 기록을 남긴다
--    · QUESTION_RESOLVED 구간(5초)에 입장한 사람도 정답을 봤으므로 기록을 남긴다
--    · 마지막 문제도 정답을 공개하므로 기록을 남긴다 (5초 대기만 생략)
--    · 강제 종료 / abandoned / server_restart 에서는 정답을 공개하지 않으므로 기록이 없다
--    · PAUSED 중에는 정답 공개가 일어나지 않으므로 기록이 없다 (자동 충족, 별도 예외 없음)
-- ★ 절대 삭제하지 않는다. guide 25·26절이 장기 보존을 요구하고,
--   강제 종료했다고 과거 경험 이력이 롤백되면 안 된다고 명시한다.
CREATE TABLE question_experiences (
  account_id           bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  question_id          bigint      NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  -- ON CONFLICT DO NOTHING 으로 삽입해 "처음 경험한 시점"을 보존한다.
  -- 경험자도 그 문제를 다시 보게 되므로(판정에서만 제외됨) 덮어쓰면 정보가 손실된다.
  first_experienced_at timestamptz NOT NULL DEFAULT now(),
  first_game_id        bigint      REFERENCES games(id) ON DELETE SET NULL,
  PRIMARY KEY (account_id, question_id)
);

CREATE INDEX question_experiences_qid_idx ON question_experiences (question_id);

-- -----------------------------------------------------------------------------
-- 7. 응답 기록 (guide 40절 통계 원천)
-- -----------------------------------------------------------------------------

-- ★ 저장 대상은 "정답 문자열과 일치한 메시지"만이다 (Q-52).
--   일반 오답 채팅은 저장하지 않는다. guide 54절의 "미친 듯이 입력하는" 특성상 양이 많고
--   Q-09에서 채팅 로그를 DB에 저장하지 않기로 확정했다.
-- ★ 이 테이블이 "프로세스가 죽어도 점수를 재구성할 수 있게" 하는 실질적 근거다.
CREATE TABLE answer_events (
  id             bigserial   PRIMARY KEY,
  game_id        bigint      NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  question_index smallint    NOT NULL,
  question_id    bigint      NOT NULL REFERENCES questions(id),
  account_id     bigint      NOT NULL REFERENCES accounts(id),

  submitted_seq  bigint      NOT NULL,            -- 서버 수신 시 부여한 단조 시퀀스 (R003 3-5)
  received_at    timestamptz NOT NULL DEFAULT now(),
  response_ms    int         NOT NULL,            -- 문제 시작 이후 경과 (서버 수신 시각 기준)

  matched        boolean     NOT NULL,            -- 정답 문자열과 일치했는가
  was_eligible   boolean     NOT NULL,            -- 판정 자격이 있었는가 (경험자면 false)
  accepted       boolean     NOT NULL,            -- 최종적으로 정답자가 되었는가

  -- 왜 정답이 되지 못했는지. guide 18절의 순서 추적과 동시 정답 사후 검증에 사용한다.
  reject_reason  text        CHECK (reject_reason IN
                   ('already_resolved', 'experienced', 'epoch_mismatch', 'past_deadline', 'not_connected'))
);

CREATE INDEX answer_events_game_idx     ON answer_events (game_id, question_index);
CREATE INDEX answer_events_account_idx  ON answer_events (account_id);
CREATE INDEX answer_events_question_idx ON answer_events (question_id);

-- -----------------------------------------------------------------------------
-- 8. 기본 데이터
-- -----------------------------------------------------------------------------

INSERT INTO sources (id, name, url, license, attribution, notes) VALUES
  ('manual', '직접 작성', NULL, 'CC-BY-SA-4.0',
   '이 프로젝트에서 직접 작성한 문제입니다.',
   '개발·테스트용 시드 및 직접 작성 문제. OpenTDB 파생 문제와 한 DB에 섞이는 것을 고려해 라이선스를 동일하게 둔다.'),
  ('opentdb', 'Open Trivia Database', 'https://opentdb.com/', 'CC-BY-SA-4.0',
   '문제 출처: Open Trivia Database (https://opentdb.com/) - CC BY-SA 4.0',
   'API 제공 상한 5,298건(verified). 그중 type=multiple 4,500건. 유한 코퍼스. (R002 2-1)');

INSERT INTO categories (key, name_ko, sort_order) VALUES
  ('general',    '일반상식',  10),
  ('history',    '역사',      20),
  ('geography',  '지리',      30),
  ('science',    '과학',      40),
  ('math',       '수학',      50),
  ('nature',     '자연',      60),
  ('art',        '예술',      70),
  ('music',      '음악',      80),
  ('movie',      '영화',      90),
  ('literature', '문학',     100),
  ('sports',     '스포츠',   110),
  ('person',     '인물',     120),
  ('tech',       '기술',     130),
  ('myth',       '신화',     140),
  ('language',   '언어',     150),
  ('etc',        '기타',     900);
