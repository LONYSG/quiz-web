-- =============================================================================
-- 0014. ★ 관리자 비밀번호 초기화 표시 · 친구 · 알림 (R043)
--
-- ★★ (A-4 · 건우 확정) accounts.must_change_password
--   관리자가 `npm run reset-password -- <아이디>` 로 초기화하면 비밀번호 0000 + 이 표시 true.
--   ★ 판단 기준은 "비밀번호가 0000 인가" 가 아니라 **이 표시** 다 — 스스로 0000 으로 가입·변경한 계정은 아무 일도 없다.
--   표시가 있으면 로그인 뒤 새 비밀번호 화면만 뜨고(다른 곳으로 못 간다) 서버도 방 입장 등을 막는다. 저장하면 지워진다.
--
-- ★★ (C · 건우 승인) 친구 · 알림
--   friendships — 신청 한 줄 = (신청한 사람 → 받은 사람, 상태). 수락하면 status = 'accepted' (서로 친구 — 한 줄로 양쪽을 나타낸다).
--     ★ 두 사람 사이에는 방향과 상관없이 한 줄만 (least/greatest 고유 인덱스). 거절·신청 취소·친구 삭제 = 그 줄을 지운다.
--   notifications — 받는 사람별 알림. 종류: 친구 신청 / 신청 수락 / 방 초대. 오프라인일 때 온 것은 다음 로그인 때 보인다.
--     ★ 친구 신청 알림은 신청 줄(friendships)이 정본이다 — 수락·거절·취소되면 알림도 지운다.
--     ★ 방 초대는 방이 사라지면 서버가 보여 주지 않는다(방은 메모리에만 산다).
-- =============================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS friendships (
  requester_id bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  addressee_id bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status       text        NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx
  ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id);

CREATE TABLE IF NOT EXISTS notifications (
  id              bigserial   PRIMARY KEY,
  account_id      bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('friend_request', 'friend_accepted', 'room_invite')),
  from_account_id bigint      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  room_id         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_account_idx ON notifications (account_id, created_at DESC);
