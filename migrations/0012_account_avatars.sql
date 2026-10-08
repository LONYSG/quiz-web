-- =============================================================================
-- 0012. 프로필 사진 (R039 / D-184)
--
-- ★ 건우: "본인 프로필 사진을 정할 수 있게 … 원 모양으로 늘리고 줄이고 잘라서 … 모든 곳에서 쓰이는 기본 프사."
-- ★★ DB 에 저장한다 (설계 담당 판단) — DB 백업에 사진도 함께 들어가 새 PC 로 옮기기 쉽다.
-- ★ 브라우저가 원형으로 자른 뒤 256×256 으로 줄여 올린다(webp, 보통 10~40KB). 서버는 형식(앞머리 바이트)과 크기를 다시 본다.
--   ★ 상한 200KB — 256×256 PNG(webp 를 못 만드는 브라우저)도 들어가는 값.
-- ★ 계정을 지우면 사진도 지워진다 (ON DELETE CASCADE).
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_avatars (
  account_id bigint      PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  image      bytea       NOT NULL,
  mime       text        NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg', 'image/png')),
  bytes      integer     NOT NULL CHECK (bytes > 0 AND bytes <= 204800),
  updated_at timestamptz NOT NULL DEFAULT now()
);
