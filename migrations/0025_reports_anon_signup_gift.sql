-- =============================================================================
-- 0025. ★★ 로그인 전 제보 · 가입 선물 50P (R063 / D-256 · D-260 — R062 흡수)
--
-- ① app_reports — 로그인 전(auth · password-change 화면)에도 받는다: account_id NULL 허용 ·
--    login_hint(로그인 칸에 쳐 둔 아이디 — 비밀번호는 절대 아님) · ip_hash(비로그인 때만 · 원 IP 는 저장 안 함).
-- ② point_grants reason 'signup' — 가입 선물 50P(가입 한 문장 안에서 · 봇 제외).
--    ★ 기존 회원 전원 소급(찬종 "기존 유저도 50씩 다 주자") — 봇(bot* · uic* · r10_*) 아닌 계정에 한 번만(이미 있으면 건너뜀).
--    seen_at null → 다음 로그인 때 GrantToast "🎁 가입 선물 +50P".
-- =============================================================================

ALTER TABLE app_reports ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS login_hint text CHECK (login_hint IS NULL OR char_length(login_hint) <= 40);
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS ip_hash text CHECK (ip_hash IS NULL OR char_length(ip_hash) <= 32);

ALTER TABLE point_grants DROP CONSTRAINT IF EXISTS point_grants_reason_check;
ALTER TABLE point_grants ADD CONSTRAINT point_grants_reason_check
  CHECK (reason IN ('feedback_adopted', 'feedback_monthly_top', 'admin', 'signup'));

INSERT INTO point_grants (account_id, amount, reason, note)
SELECT a.id, 50, 'signup', '가입 선물(소급)'
  FROM accounts a
 WHERE a.login_id !~ '^(bot|uic|r10_)'
   AND NOT EXISTS (SELECT 1 FROM point_grants g WHERE g.account_id = a.id AND g.reason = 'signup');
