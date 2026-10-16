// =============================================================================
// ★★★ 케이크 기다리기 (가제 · Cake Wait — 리듬 천국 미라클 스타즈 '간식') — R050 · D-235
//
// ★ 찬종: "1판째는 정속, 10초, 5초쯤부터 페이드아웃 되면서 시간 및 소리 제거 … 특정 시간부터 페이드아웃/시간,소리제거 가 핵심임 …
//   초반만 약간 들려주고 나머지는 리듬을 기억해서 멈춰야함." · "시간이 보일때는 줄어드는 초에 맞춰서 소리로 리듬을 알려줌 …
//   단순히 띡 띡 띡 소리만 나는게 아니라 하나의 리듬처럼."
// ★ 잰다: **이 기기에서** 판 시작 신호를 받은 순간(performance.now) → 누른 순간. 그 ms 를 서버에 보낸다(서버는 이상값만 거른다).
//   → 네트워크 지연은 받는 순간 · 보내는 순간에만 끼고 잰 시간에는 끼지 않는다(봇 cakelag — 지연 0 · 150 · 400ms).
// ★ 화면: 큰 카운트다운(소수 둘째 자리까지 흘러감) + 오븐 속 케이크 · 가림 시점부터 0.5초 페이드아웃(숫자 · 소리 둘 다) · 0초에 소리 없음.
// ★ 누르기: PC Space · Enter / 모바일 화면 톡 — 한 번만. 0초가 지나도 3초까지 누를 수 있다. 안 누르면 그 판 꼴찌.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { CAKE_FADE_MS } from '@quiz/shared';
import { cakeBeat, sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

export default function CakeWait({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const durationSec = Number(p.durationSec ?? 10);
  const speed = Number(p.speed ?? 1);
  const hideAfterSec = Number(p.hideAfterSec ?? 5);
  const targetMs = Number(p.targetMs ?? 10000);
  const lateMs = Number(p.lateMs ?? 3000);
  const key = `${view.token}:${view.roundIndex}`;
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;

  // ── 시작 시각 (이 판에서 처음 'play' 를 받은 순간)
  const t0Ref = useRef<{ key: string; t0: number } | null>(null);
  if (playing && t0Ref.current?.key !== key) {
    const t0 = view.receivedAt ?? performance.now() - Math.max(0, serverNow() - view.phaseStartedAt);
    t0Ref.current = { key, t0 };
  }
  const t0 = t0Ref.current?.key === key ? t0Ref.current.t0 : null;

  const [now, setNow] = useState(() => performance.now());
  const [pressed, setPressed] = useState<{ key: string; elapsed: number } | null>(null);
  const pressedHere = pressed?.key === key ? pressed : null;

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const elapsed = t0 !== null ? Math.max(0, now - t0) : 0; // 실제 ms
  const shownElapsedSec = (elapsed * speed) / 1000; // 화면 기준
  const remainSec = Math.max(0, durationSec - shownElapsedSec);
  const hideStart = hideAfterSec;
  const fade = shownElapsedSec <= hideStart ? 1 : Math.max(0, 1 - ((shownElapsedSec - hideStart) * 1000) / speed / CAKE_FADE_MS);
  const hidden = fade <= 0;
  const over = elapsed > targetMs + lateMs;

  // ── 리듬: 화면 기준 정수 초마다 한 박 (가려지기 전까지 · 0초는 소리 없음)
  const beatRef = useRef<{ key: string; last: number } | null>(null);
  useEffect(() => {
    if (!playing || t0 === null) return;
    const r = Math.ceil(remainSec - 1e-6); // 지금 표시 중인 정수 초
    const crossed = durationSec - Math.floor(shownElapsedSec + 1e-6); // 방금 지난 정수 초
    if (beatRef.current?.key !== key) {
      beatRef.current = { key, last: durationSec + 1 };
    }
    if (crossed < beatRef.current.last && crossed > 0 && shownElapsedSec < hideStart + 1e-6) {
      beatRef.current.last = crossed;
      cakeBeat(crossed, 1 / speed);
    }
    void r;
  }, [playing, t0, key, remainSec, shownElapsedSec, durationSec, hideStart, speed]);

  const press = () => {
    if (!canPlay || pressedHere || t0 === null || view.selfSubmitted) return;
    const e = performance.now() - t0;
    setPressed({ key, elapsed: e });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { elapsedMs: e } });
  };

  // PC — Space / Enter (채팅 입력 중이어도 미니게임이 먼저 — 진행 중일 때만)
  useEffect(() => {
    if (!canPlay) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter' && e.code !== 'Space') return;
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      press();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const display = remainSec.toFixed(2);
  const done = Boolean(pressedHere) || view.selfSubmitted;
  const lit = done || over;

  return (
    <div
      className={`cake-stage${mobile ? ' tap' : ''}${done ? ' pressed' : ''}`}
      role="button"
      tabIndex={-1}
      aria-label="누르기"
      onPointerDown={(e) => {
        if (!canPlay) return;
        e.preventDefault();
        press();
      }}
    >
      <div className="cake-count mono" style={{ opacity: hidden ? 0 : fade }} aria-live="off" data-hidden={hidden ? '1' : '0'}>
        {display}
        <span className="cake-unit">초</span>
      </div>
      {hidden && !done && !over && <p className="cake-hidden-note">리듬을 기억하세요…</p>}
      <CakeArt open={lit} />
      <p className="cake-help">
        {view.spectating
          ? '구경 중이에요'
          : done
            ? '눌렀어요! 결과를 기다리는 중…'
            : over
              ? '시간이 지났어요'
              : mobile
                ? '0초가 되는 순간 화면을 톡!'
                : '0초가 되는 순간 Space / Enter!'}
      </p>
    </div>
  );
}

/** 오븐 속 딸기 케이크 — 누르면(또는 시간이 지나면) 문이 열리고 케이크가 김을 낸다 */
export function CakeArt({ open, small = false }: { open: boolean; small?: boolean }) {
  return (
    <svg className={`cake-art${open ? ' open' : ''}${small ? ' small' : ''}`} viewBox="0 0 160 120" aria-hidden="true">
      <defs>
        <linearGradient id="oven-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd6a5" />
          <stop offset="100%" stopColor="#f4a261" />
        </linearGradient>
        <linearGradient id="oven-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d2b20" />
          <stop offset="100%" stopColor="#1f140e" />
        </linearGradient>
        <radialGradient id="oven-glow" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#ffb347" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ff7b00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cake-sponge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde3a7" />
          <stop offset="100%" stopColor="#efc27a" />
        </linearGradient>
        <radialGradient id="cake-berry" cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="100%" stopColor="#c81d3a" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="114" rx="62" ry="5" fill="#000" opacity="0.12" />
      <rect x="18" y="12" width="124" height="100" rx="14" fill="url(#oven-body)" />
      <rect x="26" y="20" width="108" height="14" rx="5" fill="#fff" opacity="0.35" />
      {[40, 58, 76].map((x) => (
        <circle key={x} cx={x} cy="27" r="3.2" fill="#e76f51" />
      ))}
      <rect x="104" y="23" width="22" height="8" rx="3" fill="#264653" opacity="0.8" />
      <g className="cake-door">
        <rect x="28" y="40" width="104" height="64" rx="9" fill="url(#oven-window)" />
        <rect x="28" y="40" width="104" height="64" rx="9" fill="url(#oven-glow)" />
        <rect x="36" y="45" width="34" height="6" rx="3" fill="#fff" opacity="0.18" />
      </g>
      <g className="cake-item">
        <ellipse cx="80" cy="96" rx="34" ry="5" fill="#fff" />
        <rect x="52" y="74" width="56" height="20" rx="4" fill="url(#cake-sponge)" />
        <rect x="52" y="81" width="56" height="3.5" fill="#fff8ee" />
        <path d="M50 76 Q56 68 62 75 Q68 68 74 75 Q80 68 86 75 Q92 68 98 75 Q104 68 110 76 L110 79 L50 79 Z" fill="#fffdf8" />
        <path d="M80 56 C72 56 70 66 74 70 C77 73 83 73 86 70 C90 66 88 56 80 56Z" fill="url(#cake-berry)" />
        <path d="M75 57 L80 53 L85 57 L80 59Z" fill="#3f8f3a" />
        <g className="cake-steam">
          <path d="M66 52 q-4 -6 0 -12 q4 -6 0 -12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
          <path d="M94 52 q-4 -6 0 -12 q4 -6 0 -12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
        </g>
      </g>
      <rect x="70" y="106" width="20" height="4" rx="2" fill="#e76f51" opacity="0.9" />
    </svg>
  );
}
