-- =============================================================================
-- 0015 — "한 사람당 열린 방 하나" 를 **지금 방장** 기준으로 (R046 · D-226)
--
-- ★ 옛 0001: rooms (created_by) WHERE closed_at IS NULL — 만든 사람 기준.
--   방을 만든 사람이 나가도 그 방이 다른 사람들로 계속 열려 있으면, 그 사람은 **새 방을 만들 수 없었다**
--   (방장은 다른 사람에게 넘어갔는데 DB 는 여전히 "그 사람 방" — 건우 버그 "나간 뒤 새 방을 만들지 못한다").
-- ★ 새 기준: host_account_id(지금 방장). 방장이 넘어갈 때 서버가 host_account_id 를 함께 바꾼다.
--   한 사람은 한 번에 한 방에만 있을 수 있으므로(메모리 · getRoomOfAccount) "동시에 방장인 방은 하나" 가 그대로 지켜진다.
-- ★ 부팅 정리(bootCleanup)가 열린 방을 모두 닫으므로 옛 줄과 겹칠 일이 없다.
-- =============================================================================

DROP INDEX IF EXISTS rooms_one_open_per_owner_idx;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_one_open_per_host_idx
  ON rooms (host_account_id) WHERE closed_at IS NULL;
