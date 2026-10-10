// =============================================================================
// ★★★ 친구 · 알림 상태 (R043 C) — App 하나에 두고 방 목록 · 방 안 둘 다에서 쓴다
//
// ★ 접속하면 목록 · 알림을 받아 온다. 서버가 바뀐 것만 보낸다(friends.presence · notifications.new).
// ★ 버튼 로딩(A-2): 동작을 보내면 그 줄의 버튼이 잠기고, 서버 결과(friends.result)가 오면 풀린다.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** ★ R044 A-5 — 아직 살아 있는 방으로 받은 초대 (최근 것이 앞) */
  invites: NotificationView[];
  /** ★ R044 A-4 — 친구 버튼 숫자 · 모바일 ☰ 점 = 받은 신청 + 받은 초대 */
  pending: number;
  /** 지금 서버를 기다리는 동작 (예: 'invite:12') */
  busy: string | null;
  lastResult: SocialResult | null;
  request: (by: { loginId?: string; accountId?: string }) => void;
  respond: (accountId: string, accept: boolean) => void;
  cancel: (accountId: string) => void;
  remove: (accountId: string) => void;
  invite: (accountId: string) => void;
  readAll: () => void;
  dismiss: (id: string) => unknown;
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
      const s0 = sentAt.current;
      if (s0) {
        const w = window as unknown as { __qwSocialTimes?: { action: string; ms: number }[] };
        (w.__qwSocialTimes ??= []).push({ action: s0.key.split(':')[0] ?? '', ms: Math.round(performance.now() - s0.at) });
        if (w.__qwSocialTimes.length > 30) w.__qwSocialTimes.shift();
      }
      sentAt.current = null;
      setBusy(null);
      setLastResult({ ...p, at: Date.now() });
    };
    socket.on('connect', load);
    socket.on('friends.state', onState);
    socket.on('friends.presence', onPresence);
    socket.on('notifications.state', onNotes);
    socket.on('notifications.new', onNewNote);
    socket.on('friends.result', onResult);
    // ★ R044 — 오류가 오면(서버가 결과 대신 error) 로딩을 푼다 (화면 위 오류 안내는 App 이 띄운다)
    const onError = () => {
      if (!sentAt.current) return;
      sentAt.current = null;
      setBusy(null);
    };
    socket.on('error', onError);
    if (socket.connected) load();
    return () => {
      socket.off('connect', load);
      socket.off('friends.state', onState);
      socket.off('friends.presence', onPresence);
      socket.off('notifications.state', onNotes);
      socket.off('notifications.new', onNewNote);
      socket.off('friends.result', onResult);
      socket.off('error', onError);
    };
  }, [socket, onNew]);

  /**
   * ★★ R044 A-1 — 로딩이 끝나지 않던 길을 막는다:
   *   서버가 결과(friends.result) 대신 오류(error)를 보내면 로딩이 영원히 돌았다 → 오류가 와도 풀린다.
   *   8초 안에 답이 없으면 풀고 "응답이 늦어요" 를 보인다.
   *   ★ 진단: 동작마다 걸린 시간(보냄 → 결과)을 window.__qwSocialTimes 에 남긴다 (최근 30개 — 화면에는 안 보인다).
   */
  const sentAt = useRef<{ key: string; at: number } | null>(null);
  const send = useCallback(
    (event: string, payload: unknown, busyKey: string) => {
      if (!socket) return;
      setBusy(busyKey);
      sentAt.current = { key: busyKey, at: performance.now() };
      socket.emit(event, payload);
      window.setTimeout(() => {
        if (sentAt.current?.key !== busyKey) return;
        sentAt.current = null;
        setBusy((b) => (b === busyKey ? null : b));
        setLastResult({ action: busyKey.split(':')[0] ?? '', ok: false, message: '응답이 늦어요. 다시 해 주세요.', at: Date.now() });
      }, 8000);
    },
    [socket],
  );

  const dismiss = useCallback((id: string) => socket?.emit('notifications.dismiss', { id }), [socket]);
  // ★ 방 코드가 없는 초대 = 방이 사라졌다 (서버가 목록을 보낼 때 지우지만, 그 사이에도 보이지 않게)
  const invites = notifications.filter((n) => n.kind === 'room_invite' && n.roomId && n.roomCode);
  return {
    invites,
    pending: incoming.length + invites.length,
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
    dismiss,
  };
}
