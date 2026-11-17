-- =============================================================================
-- 0037. ★★ 문항 × 사람 플레이 기록 (R103 · D-360) — 표 추가만
--
-- ★ 찬종(2026-11-17): "실제 정답률, 힌트 의존도, 정답이 나오는 시간 등 디테일한 통계들을 수집해서 보완해 나가는 걸로 해."
--   → 난이도를 사람 숫자로 고쳐 나가려고, 일반 퀴즈 한 문항이 공개될 때 **방의 사람마다 한 줄**을 남긴다.
-- ★ 원래 남던 것(answer_events = 정답 글자와 맞은 메시지만 · near_misses = 정답에 가까운 오답만)으로는
--   "틀린 답을 몇 번 쳤나 · 아무것도 안 쳤나 · 맞힌 순간 힌트가 어디까지 나왔나 · 그때 문항 글 · 방의 난이도 설정" 을 알 수 없었다.
-- ★ 쓰기: 정답 공개 때 한 번에(정답자가 있으면 뒷북 3초를 기다린 뒤) · void · 실패는 로그만(판이 멈추지 않는다).
-- ★ 채팅 원문은 여전히 남기지 않는다(01 9장) — 오답은 **개수만**. 오답 글자는 near_misses 그대로.
-- ★ 개인 식별 = accounts.id 그대로(새 개인정보 없음). 봇 · 검사 계정도 남기고 is_bot 으로 가른다(검사 봇으로 기록을 확인하려고).
-- ★ kind — 지금은 'quiz'(일반 상식 퀴즈)만. 다른 놀이는 나중에 같은 표에(question_id 대신 item_key).
-- ★ 되돌리기: DROP TABLE play_events;
-- =============================================================================

CREATE TABLE IF NOT EXISTS play_events (
  id              bigserial   PRIMARY KEY,
  kind            text        NOT NULL DEFAULT 'quiz' CHECK (kind ~ '^[a-z_]{1,20}$'),
  game_id         bigint      NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  question_index  smallint    NOT NULL,
  question_id     bigint      REFERENCES questions(id),          -- kind = 'quiz'
  item_key        text,                                          -- 다른 놀이(나중)
  account_id      bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  is_bot          boolean     NOT NULL,                          -- 봇 · 검사 계정(NEAR_MISS_SKIP_LOGIN) — 쓸 때 계산
  level           text,                                          -- 방 난이도 설정(beginner · intermediate · advanced)
  text_hash       text,                                          -- 그때 문항 글(질문 · 정답 · 일반 힌트 · 해설) md5 앞 12자리
  experienced     boolean     NOT NULL,                          -- 이미 본 문항(판정 제외 — 통계에서 뺀다)
  connected       boolean     NOT NULL,                          -- 정답 공개 때 접속 중
  joined_mid      boolean     NOT NULL DEFAULT false,            -- 문항이 뜬 뒤에 들어옴
  won             boolean     NOT NULL,                          -- 정답자(선착순 1명)
  correct_ms      int,                                           -- 정답 글자를 처음 친 때(문항이 뜬 뒤 ms · 못 맞히면 NULL)
  late            boolean     NOT NULL DEFAULT false,            -- 그 정답이 정답자보다 늦은 것(뒷북 3초 · 판정 제외 사유 포함)
  hint_stage      smallint    CHECK (hint_stage IS NULL OR hint_stage BETWEEN 0 AND 2),  -- 맞힌 순간 화면: 0 힌트 전 · 1 일반 힌트 뒤 · 2 초성 뒤
  wrong_count     smallint    NOT NULL DEFAULT 0,                -- 문항이 열린 동안 친 틀린 글 수
  first_ms        int,                                           -- 무엇이든 처음 친 때(아무것도 안 쳤으면 NULL)
  hints_shown     smallint    NOT NULL DEFAULT 0 CHECK (hints_shown BETWEEN 0 AND 2), -- 문항이 끝날 때까지 나온 힌트 단계
  has_general_hint boolean    NOT NULL DEFAULT false,
  resolution      text,                                          -- correct · timeout · skip_vote · host_skip
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS play_events_question_idx ON play_events (question_id);
CREATE INDEX IF NOT EXISTS play_events_game_idx ON play_events (game_id, question_index);
CREATE INDEX IF NOT EXISTS play_events_created_idx ON play_events (created_at);
