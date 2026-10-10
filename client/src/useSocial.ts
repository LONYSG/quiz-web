// =============================================================================
// ★★★ 친구 · 알림 상태 (R043 C) — App 하나에 두고 방 목록 · 방 안 둘 다에서 쓴다
//
// ★ 접속하면 목록 · 알림을 받아 온다. 서버가 바뀐 것만 보낸다(friends.presence · notifications.new).
// ★ 버튼 로딩(A-2): 동작을 보내면 그 줄의 버튼이 잠기고, 서버 결과(friends.result)가 오면 풀린다.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export interface FriendStatus {
  kind: 'offline' | 'online' | 'lobby' | 'game';
  count?: number;
  roomId?: string;
}
export interface FriendView {
  accountId: string;
  nickname: string;
  avatarV: number | null;
  status?: FriendStatus;
}
export interface NotificationView {
  id: string;
  kind: 'friend_request' | 'friend_accepted' | 'room_invite';
  fromAccountId: string;
  fromNickname: string;
  fromAvatarV: number | null;
  roomId: string | null;
  roomCode: string | null;
  createdAt: number;
  read: boolean;
}
export interface SocialResult {
  action: string;
  ok: boolean;
  message: string;
  at: number;
}

export interface Social {
  friends: FriendView[];
  incoming: FriendView[];
  outgoing: FriendView[];
  notifications: NotificationView[];
  unread: number;
  /** 지금 서버를 기다리는 동작 (예: 'invite:12') */
  busy: string | null;
  lastResult: SocialResult | null;
  request: (by: { loginId?: string; accountId?: string }) => void;
  respond: (accountId: string, accept: boolean) => void;
  cancel: (accountId: string) => void;
  remove: (accountId: string) => void;
  invite: (accountId: string) => void;
  readAll: () => void;
  dismiss: (id: string) => void;
}

export function useSocial(socket: Socket | null, onNew?: (n: { kind: string; fromNickname: string }) => void): Social {
  const [friends, setFriends] = useState<FriendView[]>([]);
  const [incoming, setIncoming] = useState<FriendView[]>([]);
  const [outgoing, setOutgoing] = useState<FriendView[]>([]);
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SocialResult | null>(null);

  useEffect(() => {
    if (!socket) return undefined;
    const load = () => {
      socket.emit('friends.list', {});
      socket.emit('notifications.list', {});
    };
    const onState = (p: { friends: FriendView[]; incoming: FriendView[]; outgoing: FriendView[] }) => {
      setFriends(p.friends);
      setIncoming(p.incoming);
      setOutgoing(p.outgoing);
    };
    const onPresence = (p: { accountId: string; status: FriendStatus }) =>
      setFriends((prev) => prev.map((f) => (f.accountId === p.accountId ? { ...f, status: p.status } : f)));
    const onNotes = (p: { items: NotificationView[] }) => setNotifications(p.items);
    const onNewNote = (p: { kind: string; fromNickname: string }) => {
      socket.emit('notifications.list', {});
      onNew?.(p);
    };
    const onResult = (p: Omit<SocialResult, 'at'>) => {
      setBusy(null);
      setLastResult({ ...p, at: Date.now() });
    };
    socket.on('connect', load);
    socket.on('friends.state', onState);
    socket.on('friends.presence', onPresence);
    socket.on('notifications.state', onNotes);
    socket.on('notifications.new', onNewNote);
    socket.on('friends.result', onResult);
    if (socket.connected) load();
    return () => {
      socket.off('connect', load);
      socket.off('friends.state', onState);
      socket.off('friends.presence', onPresence);
      socket.off('notifications.state', onNotes);
      socket.off('notifications.new', onNewNote);
      socket.off('friends.result', onResult);
    };
  }, [socket, onNew]);

  const send = useCallback(
    (event: string, payload: unknown, busyKey: string) => {
      if (!socket) return;
      setBusy(busyKey);
      socket.emit(event, payload);
    },
    [socket],
  );

  return {
    friends,
    incoming,
    outgoing,
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    busy,
    lastResult,
    request: (by) => send('friends.request', by, `request:${by.accountId ?? by.loginId ?? ''}`),
    respond: (accountId, accept) => send('friends.respond', { accountId, accept }, `respond:${accountId}`),
    cancel: (accountId) => send('friends.cancel', { accountId }, `cancel:${accountId}`),
    remove: (accountId) => send('friends.remove', { accountId }, `remove:${accountId}`),
    invite: (accountId) => send('friends.invite', { accountId }, `invite:${accountId}`),
    readAll: () => socket?.emit('notifications.read', {}),
    dismiss: (id) => socket?.emit('notifications.dismiss', { id }),
  };
}
