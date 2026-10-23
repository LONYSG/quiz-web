// =============================================================================
// ★★★ 미니게임 4차 화면 (R054 · D-244) — 풍선 불기 · 연타 10초
//
// ★ 풍선: ★ R063 펌프 규칙 — [펌프] 마다 바람 6~16(서버) · 딱 100 만점 · 넘으면 펑 · [그만].
// ★ 연타: 10초 동안 Space · 탭 횟수 — 자동 반복(e.repeat)은 버리고 keyup 뒤에만 다시 센다(D-228 꼴).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { BALLOON_PUMP_MS, BALLOON_TARGET } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';
import { typingTarget } from '../reportGuard.js';

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

// ── 풍선 불기 — ★★ R063 (D-261) 펌프 규칙: [펌프] 마다 바람(서버가 정한 6~16 — 누르면 바로 알려 줌) · 딱 100 만점 · 넘으면 펑 · [그만]
export function BalloonBlow({ socket, view, serverNow, mobile }: Props) {
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const target = Number(view.round?.params?.target ?? BALLOON_TARGET);
  const [st, setSt] = useState<{ key: string; pumps: number; total: number; add: number; popped: boolean; stop: boolean; waiting: boolean; at: number } | null>(null);
  const mine = st?.key === key ? st : null;
  const ref = useRef(mine);
  ref.current = mine;
  const playMs = view.round?.playMs ?? BALLOON_PUMP_MS;
  const elapsed = t0 !== null ? now - t0 : 0;
  const total = view.lab ? Number(view.lab.elapsedMs ?? 0) / 100 : (mine?.total ?? 0);
  const popped = mine?.popped ?? false;
  const done = Boolean(mine?.stop || popped || view.selfSubmitted || (t0 !== null && elapsed >= playMs));

  // 서버가 알려 주는 바람(그 사람에게만)
  useEffect(() => {
    const on = (f: { token: string; roundIndex: number; pumps?: number; total?: number; add?: number; popped?: boolean; stop?: boolean }) => {
      if (f.token !== view.token || f.roundIndex !== view.roundIndex || typeof f.total !== 'number') return;
      setSt({ key, pumps: Number(f.pumps ?? 0), total: f.total, add: Number(f.add ?? 0), popped: Boolean(f.popped), stop: Boolean(f.stop), waiting: false, at: performance.now() });
      if (f.popped) sfx('mg-done');
    };
    socket.on('minigame.feedback', on);
    return () => {
      socket.off('minigame.feedback', on);
    };
  }, [socket, view.token, view.roundIndex, key]);

  const pump = () => {
    const m = ref.current;
    if (!canPlay || t0 === null || done || m?.waiting) return;
    const n = (m?.pumps ?? 0) + 1;
    setSt({ key, pumps: m?.pumps ?? 0, total: m?.total ?? 0, add: m?.add ?? 0, popped: false, stop: false, waiting: true, at: m?.at ?? 0 });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { pumps: n } });
  };
  const stop = () => {
    const m = ref.current;
    if (!canPlay || t0 === null || done || !m || m.pumps === 0 || m.waiting) return;
    setSt({ ...m, stop: true });
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { pumps: m.pumps, stop: true } });
  };
  useEffect(() => {
    if (!canPlay) return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (typingTarget(e)) return;
      const isPump = e.key === ' ' || e.code === 'Space';
      const isStop = e.key === 'Enter';
      if (!isPump && !isStop) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (isPump) pump();
      else stop();
    };
    window.addEventListener('keydown', onDown, true);
    return () => window.removeEventListener('keydown', onDown, true);
  });
  // 펌프 숫자가 튀어 오르는 짧은 연출(0.5초)
  const fresh = mine && !mine.waiting && performance.now() - mine.at < 500 && mine.add > 0;
  return (
    <div className={`quiz-stage balloon-stage pump${popped ? ' popped' : ''}`}>
      <Bar view={view} t0={t0} now={now} />
      <div className="balloon-box">
        <BalloonArt pct={100 + total * 1.6} popped={popped} />
        {fresh && !popped && (
          <span key={mine!.pumps} className="balloon-add mono">
            +{mine!.add}
          </span>
        )}
      </div>
      <p className="balloon-pct mono" data-balloon-total={total}>
        <span className={popped ? 'over' : total === target ? 'perfect' : undefined}>{popped ? '펑!' : total}</span>
        <span className="dim"> / {target}</span>
      </p>
      {canPlay && !done && (
        <div className="balloon-actions">
          <button type="button" className="primary balloon-pump" data-balloon-pump onPointerDown={(e) => { e.preventDefault(); pump(); }}>
            펌프{!mobile && <kbd>Space</kbd>}
          </button>
          <button type="button" className="ghost balloon-stop" data-balloon-stop disabled={!mine || mine.pumps === 0} onClick={stop}>
            그만{!mobile && <kbd>Enter</kbd>}
          </button>
        </div>
      )}
      <p className={`quiz-num-help${done ? ' ok' : ' dim'}`}>
        {view.spectating
          ? '구경 중이에요'
          : popped
            ? '펑! 100 을 넘었어요'
            : done
              ? `${total} 에서 멈췄어요`
              : `딱 ${target} 이면 만점 · 넘으면 펑`}
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
      if (typingTarget(e)) return;
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
