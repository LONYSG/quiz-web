// =============================================================================
// ★★ 친구 · 알림 (R043 C · 0014)
//
// friendships — 두 사람 사이 한 줄 (requester → addressee, pending | accepted). 거절·취소·삭제 = 줄을 지운다.
// notifications — 받는 사람별 (friend_request · friend_accepted · room_invite). 친구 신청 알림의 정본은 friendships 줄이다.
// =============================================================================

import { query } from './pool.js';

export interface FriendRow {
  account_id: string;
  nickname: string;
  login_id: string;
  avatar_v: string | null;
  status: 'pending' | 'accepted';
  /** 내가 신청했나 (pending 일 때 의미) */
  outgoing: boolean;
}

/** 나와 관계가 있는 모든 사람 (친구 · 받은 신청 · 보낸 신청) */
export async function listRelations(me: string): Promise<FriendRow[]> {
  const r = await query<FriendRow>(
    `SELECT a.id::text AS account_id, a.nickname, a.login_id,
            (extract(epoch from av.updated_at) * 1000)::bigint::text AS avatar_v,
            f.status, (f.requester_id = $1) AS outgoing
       FROM friendships f
       JOIN accounts a ON a.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN account_avatars av ON av.account_id = a.id
      WHERE f.requester_id = $1 OR f.addressee_id = $1
      ORDER BY a.nickname`,
    [me],
  );
  return r.rows;
}

/** 수락된 친구 id 들 (실시간 상태 알림용) */
export async function listFriendIds(me: string): Promise<string[]> {
  const r = await query<{ id: string }>(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END::text AS id
       FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
    [me],
  );
  return r.rows.map((x) => x.id);
}

async function relationBetween(a: string, b: string): Promise<{ requester_id: string; status: string } | null> {
  const r = await query<{ requester_id: string; status: string }>(
    `SELECT requester_id::text, status FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [a, b],
  );
  return r.rows[0] ?? null;
}

export type RequestResult = 'requested' | 'accepted' | 'already_friends' | 'already_requested';

/**
 * 친구 신청. 상대가 이미 나에게 신청해 둔 상태면 **바로 수락**한다 (서로 신청 = 친구).
 */
export async function requestFriend(me: string, other: string): Promise<RequestResult> {
  const rel = await relationBetween(me, other);
  if (rel?.status === 'accepted') return 'already_friends';
  if (rel && rel.requester_id === me) return 'already_requested';
  if (rel) {
    await acceptFriend(me, other);
    return 'accepted';
  }
  await query(`INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING`, [me, other]);
  await query(`INSERT INTO notifications (account_id, kind, from_account_id) VALUES ($1, 'friend_request', $2)`, [other, me]);
  return 'requested';
}

/** 받은 신청 수락 (other 가 나에게 신청했다) */
export async function acceptFriend(me: string, other: string): Promise<boolean> {
  const r = await query(
    `UPDATE friendships SET status = 'accepted', accepted_at = now()
      WHERE requester_id = $2 AND addressee_id = $1 AND status = 'pending'`,
    [me, other],
  );
  if ((r.rowCount ?? 0) === 0) return false;
  await query(`DELETE FROM notifications WHERE account_id = $1 AND from_account_id = $2 AND kind = 'friend_request'`, [me, other]);
  await query(`INSERT INTO notifications (account_id, kind, from_account_id) VALUES ($1, 'friend_accepted', $2)`, [other, me]);
  return true;
}

/** 받은 신청 거절 · 보낸 신청 취소 · 친구 삭제 — 두 사람 사이 줄을 지운다 */
export async function removeRelation(me: string, other: string): Promise<boolean> {
  const r = await query(
    `DELETE FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [me, other],
  );
  await query(
    `DELETE FROM notifications WHERE kind = 'friend_request' AND ((account_id = $1 AND from_account_id = $2) OR (account_id = $2 AND from_account_id = $1))`,
    [me, other],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  return (await relationBetween(a, b))?.status === 'accepted';
}

// ─────────────────────────────────────────────────────────────────────────────
// 알림
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  kind: 'friend_request' | 'friend_accepted' | 'room_invite';
  from_account_id: string;
  from_nickname: string;
  from_avatar_v: string | null;
  room_id: string | null;
  created_at: Date;
  read_at: Date | null;
}

export async function listNotifications(me: string): Promise<NotificationRow[]> {
  const r = await query<NotificationRow>(
    `SELECT n.id::text, n.kind, n.from_account_id::text, a.nickname AS from_nickname,
            (extract(epoch from av.updated_at) * 1000)::bigint::text AS from_avatar_v,
            n.room_id, n.created_at, n.read_at
       FROM notifications n
       JOIN accounts a ON a.id = n.from_account_id
       LEFT JOIN account_avatars av ON av.account_id = a.id
      WHERE n.account_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50`,
    [me],
  );
  return r.rows;
}

export async function insertInvite(to: string, from: string, roomId: string): Promise<void> {
  // ★ 같은 사람이 같은 방으로 보낸 옛 초대는 지우고 새로 (쌓이지 않게)
  await query(`DELETE FROM notifications WHERE account_id = $1 AND from_account_id = $2 AND kind = 'room_invite'`, [to, from]);
  await query(`INSERT INTO notifications (account_id, kind, from_account_id, room_id) VALUES ($1, 'room_invite', $2, $3)`, [to, from, roomId]);
}

export async function markAllRead(me: string): Promise<void> {
  await query(`UPDATE notifications SET read_at = now() WHERE account_id = $1 AND read_at IS NULL`, [me]);
}

export async function deleteNotification(me: string, id: string): Promise<void> {
  await query(`DELETE FROM notifications WHERE account_id = $1 AND id = $2`, [me, id]);
}

/** 방이 사라진 초대는 지운다 (방은 메모리에만 산다 — 열린 방 id 목록을 받는다) */
export async function pruneStaleInvites(me: string, liveRoomIds: string[]): Promise<void> {
  await query(
    `DELETE FROM notifications WHERE account_id = $1 AND kind = 'room_invite' AND NOT (room_id = ANY($2::text[]))`,
    [me, liveRoomIds],
  );
}

export async function findAccountIdByLoginId(loginId: string): Promise<{ id: string; nickname: string } | null> {
  const r = await query<{ id: string; nickname: string }>(`SELECT id::text, nickname FROM accounts WHERE login_id = $1`, [loginId.trim().toLowerCase()]);
  return r.rows[0] ?? null;
}
