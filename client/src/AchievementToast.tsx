// =============================================================================
// ★★ 업적 토스트 (R054 · D-243) — 서버 achievement.earned → 화면 위쪽 작은 띠 4초 · 소리는 기존 결과 소리
//   (방 채팅에도 서버가 "🏅 닉네임 — 업적" 한 줄을 남긴다)
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { sfx } from './sound.js';

export default function AchievementToast({ socket }: { socket: Socket | null }) {
  const [list, setList] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!socket) return undefined;
    const on = (p: { key: string; name: string; desc?: string }) => {
      const id = Date.now() + Math.random();
      setList((l) => [...l.slice(-2), { id, name: p.name }]);
      sfx('mg-final');
      window.setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4500);
    };
    socket.on('achievement.earned', on);
    return () => {
      socket.off('achievement.earned', on);
    };
  }, [socket]);
  if (list.length === 0) return null;
  return (
    <div className="ach-toast-layer" aria-live="polite">
      {list.map((a) => (
        <div key={a.id} className="ach-toast" role="status">
          <span className="ach-toast-medal" aria-hidden="true">
            🏅
          </span>
          {/* ★ R066 (D-274 · 찬종 #44 "설명은 개인 프로필에서 · 획득 안내는 이름만") */}
          <strong>업적 — {a.name}</strong>
        </div>
      ))}
    </div>
  );
}
