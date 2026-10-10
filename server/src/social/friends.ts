// =============================================================================
// ★★★ 친구 · 알림 · 초대 — 소켓 (R043 C · 건우 승인)
//
// ★ 상태(실시간): 서버가 이미 아는 것만 쓴다 — 접속(socketByAccount) · 방(getRoomOfAccount) · 방 상태 · 인원.
//   1초마다 "접속 중인 사람의 친구" 상태를 계산해 **바뀐 것만** 그 사람에게 보낸다 (friends.presence). 친구 모임 규모라 가볍다.
// ★ 상태 종류: game(게임 중 · N명) / lobby(대기실 · N명 — 결과 화면 포함) / online(접속 중 · 방 밖) / offline
// ★ 결과는 요청한 사람에게 friends.result {action, ok, message} — 화면이 창 안에 바로 보인다(토스트로 날리지 않는다).
// ★ 알림이 새로 생기면 받는 사람에게 notifications.new — 화면은 🔔 숫자(모바일 ☰ 점)만 올린다. 게임 중에는 팝업으로 방해하지 않는다.
// =============================================================================

import type { Socket } from 'socket.io';
import {
  acceptFriend,
  areFriends,
  deleteNotification,
  findAccountIdByLoginId,
  insertInvite,
  listFriendIds,
  listNotifications,
  listRelations,
  markAllRead,
  pruneStaleInvites,
  removeRelation,
  requestFriend,
} from '../db/friends.js';
import { allRooms, getRoom, getRoomOfAccount } from '../rooms/registry.js';
import { emitToSocket } from '../rooms/emit.js';
import { on, parseObject, parseString } from '../socket/guard.js';

export interface FriendStatus {
  kind: 'offline' | 'online' | 'lobby' | 'game';
  count?: number;
  roomId?: string;
}

let socketOf: (accountId: string) => string | undefined = () => undefined;
/** 접속 중인 사람 → 그 사람의 친구들 (접속할 때 DB 에서 읽고, 수락·삭제 때 고친다) */
const friendsOf = new Map<string, Set<string>>();
/** 마지막으로 보낸 상태 (watcher:friend → 상태 문자열) */
const lastSent = new Map<string, string>();
/** 초대 연타 막기 (from:to → 시각) */
const lastInvite = new Map<string, number>();
const INVITE_GAP_MS = 20_000;

export function statusOf(accountId: string): FriendStatus {
  if (!socketOf(accountId)) return { kind: 'offline' };
  const room = getRoomOfAccount(accountId);
  const player = room?.players.get(accountId);
  if (!room || !player?.connected) return { kind: 'online' };
  const inGame = room.state === 'COUNTDOWN' || room.state === 'QUESTION_ACTIVE' || room.state === 'QUESTION_RESOLVED' || room.state === 'PAUSED';
  return { kind: inGame ? 'game' : 'lobby', count: room.players.size, roomId: room.id };
}
const key = (s: FriendStatus) => `${s.kind}:${s.count ?? ''}:${s.roomId ?? ''}`;

async function loadFriends(accountId: string): Promise<void> {
  friendsOf.set(accountId, new Set(await listFriendIds(accountId)));
}

/** 접속 · 끊김 (socket/index.ts 가 부른다) */
export function onAccountOnline(accountId: string): void {
  void loadFriends(accountId).catch(() => undefined);
}
export function onAccountOffline(accountId: string): void {
  friendsOf.delete(accountId);
  for (const k of [...lastSent.keys()]) if (k.startsWith(`${accountId}:`)) lastSent.delete(k);
}

function emitTo(accountId: string, event: string, payload: unknown): void {
  const sid = socketOf(accountId);
  if (sid) emitToSocket(sid, event, payload);
}

async function sendState(accountId: string): Promise<void> {
  const rel = await listRelations(accountId);
  const avatarV = (v: string | null) => (v === null ? null : Number(v));
  emitTo(accountId, 'friends.state', {
    friends: rel
      .filter((r) => r.status === 'accepted')
      .map((r) => ({ accountId: r.account_id, nickname: r.nickname, avatarV: avatarV(r.avatar_v), status: statusOf(r.account_id) })),
    incoming: rel.filter((r) => r.status === 'pending' && !r.outgoing).map((r) => ({ accountId: r.account_id, nickname: r.nickname, avatarV: avatarV(r.avatar_v) })),
    outgoing: rel.filter((r) => r.status === 'pending' && r.outgoing).map((r) => ({ accountId: r.account_id, nickname: r.nickname, avatarV: avatarV(r.avatar_v) })),
  });
}

async function sendNotifications(accountId: string): Promise<void> {
  await pruneStaleInvites(accountId, [...allRooms()].map((r) => r.id));
  const rows = await listNotifications(accountId);
  emitTo(accountId, 'notifications.state', {
    items: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      fromAccountId: n.from_account_id,
      fromNickname: n.from_nickname,
      fromAvatarV: n.from_avatar_v === null ? null : Number(n.from_avatar_v),
      roomId: n.room_id,
      roomCode: n.room_id ? getRoom(n.room_id)?.code ?? null : null,
      createdAt: n.created_at.getTime(),
      read: n.read_at !== null,
    })),
  });
}

/** 관계가 바뀐 두 사람에게 목록을 다시 보내고, 친구 집합을 고친다 */
async function relationChanged(a: string, b: string): Promise<void> {
  for (const id of [a, b]) {
    if (friendsOf.has(id)) await loadFriends(id);
    await sendState(id);
    await sendNotifications(id);
  }
}

const result = (s: Socket, action: string, ok: boolean, message: string): void => {
  s.emit('friends.result', { action, ok, message });
};

export function initFriends(getSocketId: (accountId: string) => string | undefined): void {
  socketOf = getSocketId;
  // ★ 실시간 상태 — 1초마다 바뀐 것만
  setInterval(() => {
    for (const [watcher, friends] of friendsOf) {
      for (const f of friends) {
        const st = statusOf(f);
        const k = `${watcher}:${f}`;
        const v = key(st);
        if (lastSent.get(k) === v) continue;
        lastSent.set(k, v);
        emitTo(watcher, 'friends.presence', { accountId: f, status: st });
      }
    }
  }, 1000).unref?.();
}

const parseAccount = (raw: unknown) => {
  const obj = parseObject(raw);
  if (!obj) return null;
  const accountId = parseString(obj.accountId, 1, 32);
  return accountId === null ? null : { accountId, accept: obj.accept === true };
};

export function registerFriendHandlers(socket: Socket): void {
  on(socket, 'friends.list', {}, async ({ session }) => {
    await sendState(session.accountId);
  });
  on(socket, 'notifications.list', {}, async ({ session }) => {
    await sendNotifications(session.accountId);
  });
  on(socket, 'notifications.read', {}, async ({ session }) => {
    await markAllRead(session.accountId);
    await sendNotifications(session.accountId);
  });
  on<{ id: string }>(
    socket,
    'notifications.dismiss',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        const id = obj ? parseString(obj.id, 1, 24) : null;
        return id === null ? null : { id };
      },
    },
    async ({ session, payload }) => {
      await deleteNotification(session.accountId, payload.id);
      await sendNotifications(session.accountId);
    },
  );

  // ── 신청 — 아이디로 · 또는 같은 방 사람(accountId)
  on<{ loginId: string | null; accountId: string | null }>(
    socket,
    'friends.request',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const loginId = obj.loginId === undefined ? null : parseString(obj.loginId, 1, 40);
        const accountId = obj.accountId === undefined ? null : parseString(obj.accountId, 1, 32);
        return loginId || accountId ? { loginId, accountId } : null;
      },
    },
    async ({ socket: s, session, payload }) => {
      let target = payload.accountId;
      if (!target && payload.loginId) target = (await findAccountIdByLoginId(payload.loginId))?.id ?? null;
      if (!target) return result(s, 'request', false, '그 아이디를 찾을 수 없어요.');
      if (target === session.accountId) return result(s, 'request', false, '자기 자신에게는 신청할 수 없어요.');
      const r = await requestFriend(session.accountId, target);
      if (r === 'already_friends') return result(s, 'request', false, '이미 친구예요.');
      if (r === 'already_requested') return result(s, 'request', false, '이미 신청했어요.');
      result(s, 'request', true, r === 'accepted' ? '친구가 됐어요.' : '친구 신청을 보냈어요.');
      emitTo(target, 'notifications.new', { kind: r === 'accepted' ? 'friend_accepted' : 'friend_request', fromNickname: session.nickname });
      await relationChanged(session.accountId, target);
    },
  );

  on<{ accountId: string; accept: boolean }>(socket, 'friends.respond', { parse: parseAccount }, async ({ socket: s, session, payload }) => {
    if (payload.accept) {
      const ok = await acceptFriend(session.accountId, payload.accountId);
      if (!ok) return result(s, 'respond', false, '이미 처리된 신청이에요.');
      result(s, 'respond', true, '친구가 됐어요.');
      emitTo(payload.accountId, 'notifications.new', { kind: 'friend_accepted', fromNickname: session.nickname });
    } else {
      await removeRelation(session.accountId, payload.accountId);
      result(s, 'respond', true, '신청을 거절했어요.');
    }
    await relationChanged(session.accountId, payload.accountId);
  });

  // 보낸 신청 취소 · 친구 삭제 — 둘 다 "두 사람 사이 줄을 지운다"
  for (const ev of ['friends.cancel', 'friends.remove'] as const) {
    on<{ accountId: string; accept: boolean }>(socket, ev, { parse: parseAccount }, async ({ socket: s, session, payload }) => {
      await removeRelation(session.accountId, payload.accountId);
      // 친구가 끊기면 초대 간격 기록도 지운다
      lastInvite.delete(`${session.accountId}:${payload.accountId}`);
      lastInvite.delete(`${payload.accountId}:${session.accountId}`);
      result(s, ev === 'friends.cancel' ? 'cancel' : 'remove', true, ev === 'friends.cancel' ? '신청을 취소했어요.' : '친구에서 지웠어요.');
      await relationChanged(session.accountId, payload.accountId);
    });
  }

  // ── ★★ 초대 — 내 방으로. 친구 · 접속 중 · 아직 내 방에 없는 사람만 · 같은 사람에게 20초에 한 번
  on<{ accountId: string; accept: boolean }>(socket, 'friends.invite', { parse: parseAccount }, async ({ socket: s, session, payload }) => {
    const room = getRoomOfAccount(session.accountId);
    if (!room) return result(s, 'invite', false, '방 안에서만 초대할 수 있어요.');
    if (!(await areFriends(session.accountId, payload.accountId))) return result(s, 'invite', false, '친구만 초대할 수 있어요.');
    if (room.players.has(payload.accountId)) return result(s, 'invite', false, '이미 이 방에 있어요.');
    if (!socketOf(payload.accountId)) return result(s, 'invite', false, '접속 중인 친구만 초대할 수 있어요.');
    const k = `${session.accountId}:${payload.accountId}`;
    if (Date.now() - (lastInvite.get(k) ?? 0) < INVITE_GAP_MS) return result(s, 'invite', false, '방금 초대했어요. 잠시 뒤에 다시.');
    lastInvite.set(k, Date.now());
    await insertInvite(payload.accountId, session.accountId, room.id);
    result(s, 'invite', true, '초대했어요.');
    emitTo(payload.accountId, 'notifications.new', { kind: 'room_invite', fromNickname: session.nickname });
    await sendNotifications(payload.accountId);
  });
}
