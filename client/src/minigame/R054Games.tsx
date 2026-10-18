// =============================================================================
// ★★★ 미니게임 4차 화면 (R054 · D-244) — 풍선 불기 · 연타 10초
//
// ★ 풍선: 누르고 있는 동안 커진다(초당 +10%) · 떼면 끝(한 번만) · 터지는 크기는 서버만 안다 — 판 결과 때 "펑!".
// ★ 연타: 10초 동안 Space · 탭 횟수 — 자동 반복(e.repeat)은 버리고 keyup 뒤에만 다시 센다(D-228 꼴).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { BALLOON_PLAY_MS, balloonSize } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

function Bar({ view, t0, now }: { view: MinigameView; t0: number | null; now: number }) {
  const playMs = view.round?.playMs ?? 10000;
  const left = t0 !== null ? Math.max(0, 1 - (now - t0) / playMs) : 1;
  return (
    <div className="circle-bar" aria-hidden="true">
      <span style={{ width: `${left * 100}%` }} />
    </div>
  );
}

/** 풍선 그림 — 크기(%)에 맞춰 커진다 */
export function BalloonArt({ pct, popped = false }: { pct: number; popped?: boolean }) {
  const s = Math.min(3, pct / 100);
  if (popped)
    return (
      <svg viewBox="0 0 200 200" className="balloon-art popped" aria-hidden="true">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={100 + Math.cos((a * Math.PI) / 180) * 20} y1={100 + Math.sin((a * Math.PI) / 180) * 20} x2={100 + Math.cos((a * Math.PI) / 180) * 60} y2={100 + Math.sin((a * Math.PI) / 180) * 60} />
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 200 200" className="balloon-art" aria-hidden="true">
      <g transform={`translate(100 108) scale(${s * 0.42}) translate(-100 -100)`}>
        <ellipse cx="100" cy="92" rx="70" ry="82" className="balloon-body" />
        <ellipse cx="72" cy="58" rx="16" ry="26" className="balloon-shine" transform="rotate(-25 72 58)" />
        <path d="M92 172 L108 172 L100 184 Z" className="balloon-knot" />
        <path d="M100 184 C 92 200 110 214 100 232" className="balloon-string" />
      </g>
    </svg>
  );
}

// ── 풍선 불기
export function BalloonBlow({ socket, view, serverNow, mobile }: Props) {
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const [hold, setHold] = useState<{ key: string; start: number; end?: number } | null>(null);
  const mine = hold?.key === key ? hold : null;
  const holdRef = useRef(mine);
  holdRef.current = mine;
  const playMs = view.round?.playMs ?? BALLOON_PLAY_MS;
  const elapsed = t0 !== null ? now - t0 : 0;
  const holdMs = view.lab?.elapsedMs ?? (mine ? (mine.end ?? Math.min(now, (t0 ?? 0) + playMs)) - mine.start : 0);
  const pct = balloonSize(holdMs);

  const down = () => {
    if (!canPlay || holdRef.current || t0 === null) return;
    setHold({ key, start: performance.now() });
  };
  const up = () => {
    const h = holdRef.current;
    if (!h || h.end !== undefined || t0 === null) return;
    const end = Math.min(performance.now(), t0 + playMs);
    setHold({ ...h, end });
    sfx('mg-done');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { startMs: h.start - t0, endMs: end - t0 } });
  };
  // 시간이 끝나면 그때 뗀 것으로
  useEffect(() => {
    if (mine && mine.end === undefined && elapsed >= playMs) up();
  });
  useEffect(() => {
    if (!canPlay) return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) down();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space' && e.key !== 'Enter') return;
      e.preventDefault();
      up();
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
  });
  return (
    <div
      className={`quiz-stage balloon-stage${mine && mine.end === undefined ? ' holding' : ''}`}
      role="button"
      tabIndex={-1}
      aria-label="누르고 있기"
      onPointerDown={(e) => {
        if (!canPlay) return;
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        down();
      }}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <Bar view={view} t0={t0} now={now} />
      <div className="balloon-box">
        <BalloonArt pct={pct} />
      </div>
      <p className="balloon-pct mono">{pct.toFixed(1)}%</p>
      <p className={`quiz-num-help${mine?.end !== undefined ? ' ok' : ' dim'}`}>
        {view.spectating
          ? '구경 중이에요'
          : mine?.end !== undefined
            ? `${pct.toFixed(1)}% 에서 멈췄어요 — 터졌는지는 결과에서!`
            : mine
              ? '부는 중… 터지기 전에 떼세요!'
              : mobile
                ? '화면을 누르고 있으면 커져요 — 떼면 끝'
                : 'Space 를 누르고 있으면 커져요 — 떼면 끝'}
      </p>
    </div>
  );
}

// ── 연타 10초
export function TapRush({ socket, view, serverNow, mobile }: Props) {
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const playMs = view.round?.playMs ?? 10000;
  const over = t0 !== null && now - t0 >= playMs;
  const [count, setCount] = useState<{ key: string; n: number } | null>(null);
  const n = count?.key === key ? count.n : 0;
  const nRef = useRef(n);
  nRef.current = n;
  const held = useRef(false);
  const sentRef = useRef<{ key: string; n: number; final: boolean } | null>(null);

  const tap = () => {
    if (!canPlay || over || t0 === null) return;
    setCount({ key, n: nRef.current + 1 });
  };
  // 0.25초마다 지금 횟수(임시) · 끝나면 확정
  useEffect(() => {
    if (!canPlay) return undefined;
    const iv = window.setInterval(() => {
      const s = sentRef.current;
      const fin = t0 !== null && performance.now() - t0 >= playMs;
      if (s?.key === key && s.final) return;
      if (s?.key === key && s.n === nRef.current && !fin) return;
      sentRef.current = { key, n: nRef.current, final: fin };
      socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { count: nRef.current, elapsedMs: t0 !== null ? Math.round(performance.now() - t0) : null, final: fin } });
    }, 250);
    return () => window.clearInterval(iv);
  }, [canPlay, key, playMs, socket, t0, view.token, view.roundIndex]);
  useEffect(() => {
    if (!canPlay) return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      // ★ 꾹 누름(자동 반복)은 버린다 — 떼야 다시 센다
      if (e.repeat || held.current) return;
      held.current = true;
      tap();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space' && e.key !== 'Enter') return;
      held.current = false;
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
  });
  return (
    <div className="quiz-stage tap-stage">
      <Bar view={view} t0={t0} now={now} />
      <p className="tap-count mono" data-count={n}>
        {n}
      </p>
      <button
        type="button"
        className="tap-btn"
        disabled={!canPlay || over}
        onPointerDown={(e) => {
          e.preventDefault();
          tap();
        }}
      >
        {over ? '끝!' : mobile ? '톡톡톡!' : 'Space 연타!'}
      </button>
      <p className="quiz-num-help dim">{view.spectating ? '구경 중이에요' : over ? `${n}번!` : '꾹 누르기는 안 세요 — 떼었다 눌러야 해요'}</p>
    </div>
  );
}
