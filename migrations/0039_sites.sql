-- =============================================================================
-- 0039. ★★★ 두 자리(공개 · 베타) + 문제 데이터 라이선스 걷기 (R109 · D-369)
--
-- ★ 찬종(2026-11-19): "저작권/상업적 이용이 어려운 것들은 전부 지인용 자리로 보내. 저작권 표기 같은 건 지인용/공개용 둘 다 반영해."
--   서버 하나 · DB 하나 · 주소만 둘(PUBLIC_HOSTNAME · FRIEND_HOSTNAME). 정본 목록 = shared/src/site.ts.
--
-- ① accounts.is_friend — 지인 자리(베타 주소)에 들어갈 수 있는 계정. 기본 false.
--    ★ 이 마이그레이션이 도는 시점에 이미 있는 계정은 전부 true(지금까지의 가입자는 다 지인이다 · 봇 포함).
--      새로 가입하는 계정은 false — 찬종이 ops 메뉴(scripts/friend-set.mjs)로 켠다.
-- ② emoji_themes.restricted — 지인 자리에서만 나오는 특별 이모티콘 테마. 지금 있는 치이카와 = true.
-- ③ games.site — 그 판을 연 자리('public' | 'friend' · 옛 판 NULL). 나중에 공개 쪽 통계만 따로 보려고.
-- ④ 문제 데이터 라이선스 — 문항은 전부 우리가 만든 것(R106 에서 외부 문제집을 지웠다).
--    옛 "CC BY-SA 4.0 으로 배포" 선언을 걷는다: sources.license · questions.license 의 'CC-BY-SA-4.0' 값을 비운다(칸은 둔다).
--    sources.license 는 NOT NULL 이었다 → 제약을 푼다. 정본 문서 = DATA_LICENSE.md
-- ★ 멱등 · 빈 DB(0001 부터)에도 통과한다.
-- ★ 되돌리기: ALTER TABLE accounts DROP COLUMN is_friend; ALTER TABLE emoji_themes DROP COLUMN restricted;
--   ALTER TABLE games DROP COLUMN site; 라이선스 값은 백업에서(값을 비우는 것이라 SQL 로는 되돌릴 수 없다 — 다만 옛 값은 셋 다 'CC-BY-SA-4.0' 하나였다).
-- =============================================================================

-- ① 계정 — 칸이 처음 생길 때만 지금 있는 계정을 전부 지인으로(두 번 돌아도 새 가입자를 켜지 않게)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'is_friend'
  ) THEN
    ALTER TABLE accounts ADD COLUMN is_friend boolean NOT NULL DEFAULT false;
    UPDATE accounts SET is_friend = true;
  END IF;
END $$;

-- ② 이모티콘 테마
ALTER TABLE emoji_themes ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false;
UPDATE emoji_themes SET restricted = true WHERE key = 'chiikawa';

-- ③ 판의 자리
ALTER TABLE games ADD COLUMN IF NOT EXISTS site text CHECK (site IS NULL OR site IN ('public', 'friend'));

-- ④ 문제 데이터 라이선스 걷기
ALTER TABLE sources ALTER COLUMN license DROP NOT NULL;
UPDATE sources   SET license = NULL WHERE license = 'CC-BY-SA-4.0';
UPDATE questions SET license = NULL WHERE license = 'CC-BY-SA-4.0';
