-- =============================================================================
-- 0023. ★★ 포인트 지급 표 point_grants · 제보 채택 (R059 / D-254 — 찬종 "가장 도움이 된 제보를 한 유저에게 보너스 포인트")
--
-- ★ 포인트 = 맞힌 문제 + 미니게임 보상 + **지급(point_grants)** − 쓴 것 (server/src/db/points.ts POINTS_SQL).
-- ★ 지급 원천: 'feedback_adopted'(설문 채택 — npm run feedback:adopt) · 'feedback_monthly_top'(월 최다 채택) · 'admin'(수동 — npm run points:grant).
-- ★ seen_at — 받은 사람에게 로비 토스트를 한 번 보이고 기록한다.
-- ★ 이관: 2026-10-21 관리자 지급을 가짜 미니게임 판(minigame_key 'admin-grant')으로 넣은 것 → point_grants('admin') 로 옮기고 그 판을 지운다.
--   잔액은 그대로다(보상 → 지급으로 갈래만 바뀐다). 전적 · 업적은 minigame_rewards 만 읽으므로 가짜 판이 사라지는 편이 맞다.
-- =============================================================================

CREATE TABLE IF NOT EXISTS point_grants (
  id          bigserial   PRIMARY KEY,
  account_id  bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount      integer     NOT NULL CHECK (amount > 0),
  reason      text        NOT NULL CHECK (reason IN ('feedback_adopted', 'feedback_monthly_top', 'admin')),
  ref_type    text        CHECK (ref_type IN ('question_feedback')),
  ref_id      bigint,
  note        text        CHECK (note IS NULL OR char_length(note) <= 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  seen_at     timestamptz
);
CREATE INDEX IF NOT EXISTS point_grants_account_idx ON point_grants (account_id, created_at);

-- 채택 표시 — 한 설문 한 번(adopted_at 이 있으면 다시 채택하지 않는다 · 스크립트가 확인)
ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS adopted_at timestamptz;
ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS adopted_grant_id bigint REFERENCES point_grants(id) ON DELETE SET NULL;

-- ── 이관 (가짜 판 → point_grants · 알림은 이미 받은 것으로 seen_at = now())
INSERT INTO point_grants (account_id, amount, reason, note, created_at, seen_at)
SELECT w.account_id, w.amount, 'admin',
       '수동 지급(이관 — 가짜 미니게임 판 #' || r.id || ')',
       coalesce(r.ended_at, r.started_at, now()), now()
  FROM minigame_rewards w JOIN minigame_runs r ON r.id = w.run_id
 WHERE r.minigame_key = 'admin-grant' AND w.amount > 0;

DELETE FROM minigame_runs WHERE minigame_key = 'admin-grant';  -- rewards · players · results · rounds 는 CASCADE
