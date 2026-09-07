// =============================================================================
// 방 상태 구독
//
// ★ room.state 스냅샷을 정본으로 삼고, 개별 이벤트는 그 위에 부분 갱신을 얹는다.
//   스냅샷 하나로 중간 참가 / 재접속 / resync 를 모두 처리하므로(R003 3-4)
//   클라이언트도 같은 코드 경로를 쓴다.
//
// ★ 클라이언트는 서버 상태를 표시하고 입력을 전달하는 역할만 한다 (guide 44절).
//   여기서 게임 판정이나 상태 전환을 하지 않는다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export interface PlayerView {
  accountId: string;
  nickname: string;
  colorIndex: number;
  connected: boolean;
  isHost: boolean;
  joinOrder: number;
  score: number;
}

export interface ChatView {
  id: string;
  seq: number;
  accountId: string;
  nickname: string;
  colorIndex: number;
  text: string;
  masked: boolean;
  ts: number;
  system: boolean;
}

export interface RoomSnapshot {
  reason: 'join' | 'reconnect' | 'resync';
  serverTime: number;
  seq: number;
  me: { accountId: string; nickname: string; colorIndex: number; isHost: boolean };
  room: {
    id: string;
    title: string;
    hostAccountId: string;
    state: string;
    maxPlayers: number;
    settings: { questionCount: number; startMode: string; countdownSec: number };
    settingsLocked: boolean;
    activeCount: number;
    availableQuestionCount: number | null;
  };
  players: PlayerView[];
  chat: ChatView[];
}

export interface SocketErrorPayload {
  code: string;
  message: string;
  detail: string | null;
}

export interface RoomHook {
  snapshot: RoomSnapshot | null;
  chat: ChatView[];
  error: SocketErrorPayload | null;
  clearError: () => void;
  /** 서버가 다른 곳에서의 접속 때문에 이 연결을 끊었는가 (Q-06) */
  terminated: boolean;
}

export function useRoom(socket: Socket | null): RoomHook {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [chat, setChat] = useState<ChatView[]>([]);
  const [error, setError] = useState<SocketErrorPayload | null>(null);
  const [terminated, setTerminated] = useState(false);

  useEffect(() => {
    if (!socket) return undefined;

    const onState = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setChat(snap.chat);
      setError(null);
    };

    const patchPlayers = (payload: { players?: PlayerView[]; activeCount?: number }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: payload.players ?? prev.players,
          room: {
            ...prev.room,
            activeCount: payload.activeCount ?? prev.room.activeCount,
          },
        };
      });
    };

    const onConnectionChanged = (payload: {
      accountId: string;
      connected: boolean;
      activeCount: number;
    }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          // ★ 표시용 connected 는 서버가 5초 유예 뒤에 room.playersUpdated 로 알려준다.
          //   여기서는 재접속(connected=true)만 즉시 반영한다.
          players: payload.connected
            ? prev.players.map((p) =>
                p.accountId === payload.accountId ? { ...p, connected: true } : p,
              )
            : prev.players,
          room: { ...prev.room, activeCount: payload.activeCount },
        };
      });
    };

    const onHostChanged = (payload: { hostAccountId: string }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          room: { ...prev.room, hostAccountId: payload.hostAccountId },
          me: { ...prev.me, isHost: prev.me.accountId === payload.hostAccountId },
          players: prev.players.map((p) => ({
            ...p,
            isHost: p.accountId === payload.hostAccountId,
          })),
        };
      });
    };

    const onChat = (message: ChatView) => {
      setChat((prev) => {
        // 중복 방지. 재접속 스냅샷과 실시간 메시지가 겹칠 수 있다
        if (prev.some((m) => m.id === message.id)) return prev;
        const next = [...prev, message];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    };

    const onLeft = () => {
      setSnapshot(null);
      setChat([]);
    };

    socket.on('room.state', onState);
    socket.on('room.playerJoined', patchPlayers);
    socket.on('room.playerLeft', patchPlayers);
    socket.on('room.playersUpdated', patchPlayers);
    socket.on('room.connectionChanged', onConnectionChanged);
    socket.on('room.hostChanged', onHostChanged);
    socket.on('chat.message', onChat);
    socket.on('room.left', onLeft);
    socket.on('error', setError);
    socket.on('session.terminated', () => setTerminated(true));

    return () => {
      socket.off('room.state', onState);
      socket.off('room.playerJoined', patchPlayers);
      socket.off('room.playerLeft', patchPlayers);
      socket.off('room.playersUpdated', patchPlayers);
      socket.off('room.connectionChanged', onConnectionChanged);
      socket.off('room.hostChanged', onHostChanged);
      socket.off('chat.message', onChat);
      socket.off('room.left', onLeft);
      socket.off('error', setError);
    };
  }, [socket]);

  return { snapshot, chat, error, clearError: () => setError(null), terminated };
}
