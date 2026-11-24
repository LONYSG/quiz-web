-- =============================================================================
-- 0040. ★★★ 공방 1 (R116 · D-373 · docs/24 3-8 · 6-2 · 12절) — 더하기만
--
-- ① question_experiences.last_experienced_at — 마지막으로 본 때(본 문제 유효 기간 EXPERIENCE_DAYS · 24 6-2 나).
--    NULL = 처음 본 때 그대로(옛 줄). 기록할 때마다 덮어쓴다(처음 본 때 · 판은 그대로). 스위치가 꺼져 있으면 읽는 곳이 없다.
-- ② app_reports — 사람 신고(kind 'user' · 신고 대상 · 그 방 최근 채팅 30줄 — 신고 때만 채팅을 남긴다 · 01 9장에 한 줄).
-- ③ account_blocks — 개인 차단(내 화면에서만 그 사람의 채팅 · 이모티콘을 가린다 · 서버 방송은 그대로).
-- ④ play_events — 문제마다 남길 값 더(24 12-2): 그때 등급 · 방 종류 · 그 문항 때 방 인원 · 기기.
--
-- ★ 되돌리기(데이터를 버려도 될 때만):
--   ALTER TABLE question_experiences DROP COLUMN last_experienced_at;
--   ALTER TABLE app_reports DROP COLUMN target_account_id, DROP COLUMN chat_excerpt; (kind 'user' 줄을 먼저 지우고 CHECK 를 옛 다섯으로)
--   DROP TABLE account_blocks;
--   ALTER TABLE play_events DROP COLUMN grade, DROP COLUMN room_kind, DROP COLUMN room_size, DROP COLUMN device;
-- =============================================================================

ALTER TABLE question_experiences ADD COLUMN IF NOT EXISTS last_experienced_at timestamptz;

ALTER TABLE app_reports DROP CONSTRAINT IF EXISTS app_reports_kind_check;
ALTER TABLE app_reports ADD CONSTRAINT app_reports_kind_check CHECK (kind IN ('bug', 'awkward', 'idea', 'question', 'other', 'user'));
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS target_account_id bigint REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS chat_excerpt jsonb;

CREATE TABLE IF NOT EXISTS account_blocks (
  account_id  bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked_id  bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, blocked_id),
  CHECK (account_id <> blocked_id)
);

ALTER TABLE play_events ADD COLUMN IF NOT EXISTS grade smallint;
ALTER TABLE play_events ADD COLUMN IF NOT EXISTS room_kind text CHECK (room_kind IS NULL OR room_kind IN ('quiz', 'draw', 'liar'));
ALTER TABLE play_events ADD COLUMN IF NOT EXISTS room_size smallint;
ALTER TABLE play_events ADD COLUMN IF NOT EXISTS device text CHECK (device IS NULL OR device IN ('pc', 'mobile'));
