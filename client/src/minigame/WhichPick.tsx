// =============================================================================
// ★★★ 어느 쪽? (R052 · D-239) — 둘 중 더 큰 것 · 더 먼저인 것 · 10문항 연속
//
// ★ 문항당 6초 · A/B 를 누른다(PC ← → 또는 클릭 · 모바일 톡) · 한 번만. 맞히면 1점 · 같으면 맞힌 문항 시간 합이 작은 쪽(서버).
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';
import { QuizImage, SeenBadge } from './QuizParts.js';
import { typingTarget } from '../reportGuard.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

type Side = { label: string; imageId: string | null };

export default function WhichPick({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const a = (p.a as Side | undefined) ?? { label: 'A', imageId: null };
  const b = (p.b as Side | undefined) ?? { label: 'B', imageId: null };
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const playMs = view.round?.playMs ?? 6000;
  const left = t0 !== null ? Math.max(0, 1 - (now - t0) / playMs) : 1;
  const [picked, setPicked] = useState<{ key: string; choice: 'a' | 'b' } | null>(null);
  const mine = picked?.key === key ? picked : null;

  const pick = (choice: 'a' | 'b') => {
    if (!canPlay || mine || t0 === null) return;
    setPicked({ key, choice });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { choice, elapsedMs: performance.now() - t0 } });
  };

  useEffect(() => {
    if (!canPlay) return undefined;
    const on = (e: KeyboardEvent) => {
      if (typingTarget(e)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      pick(e.key === 'ArrowLeft' ? 'a' : 'b');
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });

  const card = (side: 'a' | 'b', s: Side) => (
    <button
      type="button"
      className={`which-card${mine?.choice === side ? ' picked' : ''}${mine && mine.choice !== side ? ' other' : ''}`}
      data-side={side}
      disabled={!canPlay || Boolean(mine)}
      onClick={() => pick(side)}
    >
      {/* ★ R068 — 사진이 없으면 "연습용" 도형을 그리지 않는다(연습 판만 — 실판에서 "(연습용)" 이 보였다 · 찬종 10-26 ①) */}
      {Boolean(s.imageId || p.dummy) && <QuizImage imageId={s.imageId} alt={s.label} className="which-img" />}
      <span className="which-label">{s.label}</span>
      {!mobile && <span className="which-key mono">{side === 'a' ? '←' : '→'}</span>}
    </button>
  );

  return (
    <div className="quiz-stage which-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${(mine ? 0 : left) * 100}%` }} />
      </div>
      <SeenBadge view={view} />
      <p className="which-stem no-copy">{String(p.stem ?? '')}</p>
      <div className="which-pair">
        {card('a', a)}
        <span className="which-vs">VS</span>
        {card('b', b)}
      </div>
      <p className="quiz-num-help dim">{mine ? '골랐어요!' : view.spectating ? '구경 중이에요' : mobile ? '더 맞는 쪽을 톡' : '← A · → B (또는 클릭)'}</p>
    </div>
  );
}
