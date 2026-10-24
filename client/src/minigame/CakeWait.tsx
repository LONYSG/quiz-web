// =============================================================================
// ★★★ 고기 굽기 (옛 케이크 기다리기 — 리듬 천국 미라클 스타즈 '간식') — R050 · D-235 → ★ R063 (D-261) 고기 · 카운트다운
//   ★ R063 — 찬종 #13: 생고기 → 익어 감 → 딱 좋게 → 탐 · "10" 을 1초 보여 주고 10, 9, 8 … (큰 정수 · 작은 소수)
//     판 동안 고기는 **가려지는 순간까지만** 익는다(그 뒤엔 지글지글만 — 색이 시간을 알려 주면 가림이 무의미) · 누르면 내 결과 굽기로.
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
import { CAKE_FADE_MS, CAKE_HOLD_SEC, cakeDisplaySec, meatDoneness } from '@quiz/shared';
import { cakeBeat, sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { typingTarget } from '../reportGuard.js';

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
  const remainSec = cakeDisplaySec(durationSec, shownElapsedSec);
  // ★ R063 — 가림은 "흐르기 시작한 뒤 hideAfterSec 초" (처음 1초 멈춤 뒤부터 센다)
  const hideStart = hideAfterSec + CAKE_HOLD_SEC;
  const fade = shownElapsedSec <= hideStart ? 1 : Math.max(0, 1 - ((shownElapsedSec - hideStart) * 1000) / speed / CAKE_FADE_MS);
  const hidden = fade <= 0;
  const over = elapsed > targetMs + lateMs;

  // ── 리듬: 화면 숫자가 정수(10.00 · 9.00 …)에 닿을 때마다 한 박 (가려지기 전까지 · 0초는 소리 없음)
  //   ★ R063 — 처음 1초 멈춤이 끝나는 순간이 "10" · 그 뒤 1초마다 9 · 8 … → "0" 박자가 곧 목표
  const beatRef = useRef<{ key: string; last: number } | null>(null);
  // ★ R066 (D-279) — 박자 점 4개(넷째가 강세 · 0초는 늘 넷째) — 박마다 차례로 켜진다
  const [lit, setLit] = useState<number | null>(null);
  useEffect(() => {
    if (!playing || t0 === null) return;
    const crossed = durationSec + CAKE_HOLD_SEC - Math.floor(shownElapsedSec + 1e-6); // 방금 닿은 정수
    if (beatRef.current?.key !== key) {
      beatRef.current = { key, last: durationSec + 1 };
    }
    if (crossed <= durationSec && crossed < beatRef.current.last && crossed > 0 && shownElapsedSec < hideStart + 1e-6) {
      beatRef.current.last = crossed;
      cakeBeat(crossed, 1 / speed);
      setLit(3 - (crossed % 4));
    }
  }, [playing, t0, key, shownElapsedSec, durationSec, hideStart, speed]);

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
      if (typingTarget(e)) return;
      if (e.key !== ' ' && e.key !== 'Enter' && e.code !== 'Space') return;
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      press();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ★ R063 — 큰 정수 + 작은 소수 ("10" 크게 ".00" 작게)
  const [bigPart, smallPart] = remainSec.toFixed(2).split('.');
  const done = Boolean(pressedHere) || view.selfSubmitted;
  // ★ 고기: 판 동안은 가려지는 순간까지만 익는다 · 누르면 내 굽기 · 시간이 지나면 탐
  const cookUntil = Math.min(shownElapsedSec, hideStart);
  const playD = Math.min(0.85, (cookUntil / (durationSec + CAKE_HOLD_SEC)) * 1.1);
  const mineD = pressedHere ? meatDoneness((pressedHere.elapsed - targetMs) / 1000) : over ? meatDoneness(null) : null;

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
        <span className="cake-big">{bigPart}</span>
        <span className="cake-small">.{smallPart}</span>
        <span className="cake-unit">초</span>
      </div>
      {!hidden && !done && !over && playing && (
        <div className="cake-beats" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`cake-dot${i === 3 ? ' strong' : ''}${lit === i ? ' on' : ''}`} />
          ))}
        </div>
      )}
      {hidden && !done && !over && <p className="cake-hidden-note">리듬을 기억하세요…</p>}
      <MeatArt d={mineD ? mineD.d : playD} sizzle={playing && !done && !over} />
      {mineD && !view.spectating && <p className={`meat-label ${mineD.level}`}>{mineD.label}</p>}
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

/** 고기 색 — d: 0 생고기(붉은) → 1 딱 좋게(갈색 · 석쇠 자국) → 1.6 새까맣게 */
function meatColor(d: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [214, 70, 88]],
    [0.5, [196, 110, 96]],
    [1, [150, 82, 42]],
    [1.3, [92, 52, 30]],
    [1.6, [38, 26, 20]],
  ];
  const x = Math.max(0, Math.min(1.6, d));
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1]![0]) i += 1;
  const [a, ca] = stops[i]!;
  const [b, cb] = stops[i + 1]!;
  const t = (x - a) / (b - a || 1);
  const c = ca.map((v, k) => Math.round(v + (cb[k]! - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** ★ R063 — 석쇠 위 고기 한 점(인라인 SVG — 외부 그림 없음). d 로 익은 정도 · sizzle 이면 김이 오른다 */
export function MeatArt({ d, sizzle = false, small = false }: { d: number; sizzle?: boolean; small?: boolean }) {
  const fill = meatColor(d);
  const marks = d >= 0.7 ? Math.min(1, (d - 0.7) / 0.3) : 0;
  return (
    <svg className={`cake-art meat-art${small ? ' small' : ''}${sizzle ? ' sizzle' : ''}`} viewBox="0 0 160 120" aria-hidden="true" data-doneness={d.toFixed(2)}>
      <ellipse cx="80" cy="112" rx="64" ry="5" fill="#000" opacity="0.12" />
      {/* 석쇠 */}
      <rect x="14" y="30" width="132" height="76" rx="12" fill="#3a3a44" />
      {[40, 58, 76, 94, 112].map((x) => (
        <rect key={x} x={x} y="34" width="4" height="68" rx="2" fill="#5c5c68" />
      ))}
      {/* 고기 */}
      <path d="M38 64 C34 46 58 38 82 42 C108 44 128 52 124 72 C122 90 98 98 74 96 C52 94 40 84 38 64Z" fill={fill} />
      <path d="M50 58 C60 52 76 52 84 56" fill="none" stroke="#fff" strokeOpacity={Math.max(0, 0.55 - d * 0.4)} strokeWidth="5" strokeLinecap="round" />
      <path d="M96 76 C104 74 112 70 114 64" fill="none" stroke="#fff" strokeOpacity={Math.max(0, 0.45 - d * 0.35)} strokeWidth="4" strokeLinecap="round" />
      {marks > 0 && (
        <g stroke="#2a1608" strokeOpacity={0.7 * marks} strokeWidth="4" strokeLinecap="round">
          <path d="M54 54 L76 88" />
          <path d="M72 48 L96 90" />
          <path d="M92 48 L112 82" />
        </g>
      )}
      {sizzle && (
        <g className="meat-steam" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.7">
          <path d="M62 36 q-4 -6 0 -12 q4 -6 0 -12" />
          <path d="M98 36 q-4 -6 0 -12 q4 -6 0 -12" />
        </g>
      )}
    </svg>
  );
}

/** 옛 이름 — 규칙 화면 · 실험실이 부른다(R063 부터 고기) */
export function CakeArt({ open, small = false }: { open: boolean; small?: boolean }) {
  return <MeatArt d={open ? 1 : 0} small={small} />;
}
