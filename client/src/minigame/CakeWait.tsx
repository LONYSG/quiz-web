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
// ★★★ R067 (D-294 · 찬종 "기존 거 필요 없고 내 요구사항에 맞춰서 새로 만들어") — 화면 · 소리 새로:
//   · 세로 한 줄 [초] / [고기] / [결과 문구] / [도움 한 줄] 모두 가운데 · 초 칸은 끝까지 자리를 차지(사라질 때 투명도만)
//     → 안 누름 · 누름 · 시간 끝 어느 상태든 고기와 문구 자리가 같다(옛 2열 격자는 투명 카운트가 1열을 차지해 문구가 왼쪽 아래로 갔다)
//   · 숫자는 정수 초만 · 강조색 → 0 에 가까울수록 주황 → 빨강 · 바뀔 때마다 박동 · 가림 구간에 0.6초 스르륵
//   · 소리 똑·딱(cakeTick) — 1초마다 "똑" · 0.5초마다 작은 "딱" · 가린 뒤에도 이어지되 0 까지 점점 작게(1 → 0.25) · 0 에서 멈춤
// ★ 누르기: PC Space · Enter / 모바일 화면 톡 — 한 번만. 0초가 지나도 3초까지 누를 수 있다. 안 누르면 그 판 꼴찌.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { CAKE_FADE_MS, CAKE_HOLD_SEC, cakeDisplaySec, meatDoneness } from '@quiz/shared';
import { cakeTick, sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { typingTarget } from '../reportGuard.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

/** ★ R067 — 초 글자색: 테마 강조색 → 주황 → 빨강 (p 0 = 시작 · 1 = 0초 · 밤 테마도 같은 식) */
function countColor(p: number): string {
  const x = Math.max(0, Math.min(1, p));
  return x <= 0.5
    ? `color-mix(in oklab, var(--accent) ${Math.round(100 - x * 200)}%, #ff8a1f)`
    : `color-mix(in oklab, #ff8a1f ${Math.round(200 - x * 200)}%, #e8392f)`;
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
  // ★ 실험실 — 누른 뒤 모습(?pressed=오차초)
  const [pressed, setPressed] = useState<{ key: string; elapsed: number } | null>(() =>
    view.lab?.pressedErr !== undefined ? { key, elapsed: targetMs + view.lab.pressedErr * 1000 } : null,
  );
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
  const endSec = durationSec + CAKE_HOLD_SEC; // 화면 0초가 되는 때
  const hidden = shownElapsedSec > hideStart;
  const over = elapsed > targetMs + lateMs;
  const done = Boolean(pressedHere) || view.selfSubmitted;

  // ── ★ R067 똑·딱: 반 초(화면 기준)마다 한 번 — 정수 초에 "똑" · 그 사이 반 초에 작은 "딱".
  //   처음 1초 멈춤 동안은 조용 · 첫 "똑" = 10 → 9 로 넘어가는 순간 · 0 에 닿으면 멈춤(정답 소리 금지) · 누르면 멈춤.
  //   가린 뒤에도 이어지되 0 까지 점점 작게(1 → 0.25) — 리듬만 남긴다.
  const tickRef = useRef<{ key: string; last: number } | null>(null);
  useEffect(() => {
    if (!playing || t0 === null || done) return;
    if (tickRef.current?.key !== key) tickRef.current = { key, last: 1 };
    const half = Math.floor(shownElapsedSec * 2 + 1e-6); // 지난 반 초 수
    if (half <= tickRef.current.last || half >= endSec * 2) return;
    tickRef.current.last = half;
    const at = half / 2;
    const vol = at <= hideStart ? 1 : 1 - 0.75 * Math.min(1, (at - hideStart) / Math.max(0.5, endSec - hideStart));
    cakeTick(half % 2 === 0, vol);
  }, [playing, t0, key, shownElapsedSec, endSec, hideStart, done]);

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

  // ★ R067 — 정수 초만(10 · 9 … 0) · 바뀌는 순간 = 똑
  const n = Math.ceil(remainSec - 1e-6);
  // ★ 고기: 판 동안은 가려지는 순간까지만 익는다 · 누르면 내 굽기 · 시간이 지나면 탐
  const cookUntil = Math.min(shownElapsedSec, hideStart);
  const playD = Math.min(0.85, (cookUntil / endSec) * 1.1);
  const mineD = pressedHere ? meatDoneness((pressedHere.elapsed - targetMs) / 1000) : over ? meatDoneness(null) : null;
  const help = view.spectating
    ? '구경 중이에요'
    : done
      ? '눌렀어요! 결과를 기다리는 중…'
      : over
        ? '시간이 지났어요'
        : hidden
          ? '리듬을 기억하세요…'
          : mobile
            ? '0초가 되는 순간 화면을 톡!'
            : '0초가 되는 순간 Space / Enter!';

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
      {/* 초 칸 — 사라져도 자리는 그대로(투명도만) */}
      <div
        className="cake-count mono"
        style={{ opacity: hidden ? 0 : 1, transitionDuration: `${CAKE_FADE_MS}ms`, color: countColor(1 - n / Math.max(1, durationSec)) }}
        aria-live="off"
        data-hidden={hidden ? '1' : '0'}
        data-cake-count={n}
      >
        <span key={n} className="cake-num">
          {n}
        </span>
        <span className="cake-unit">초</span>
      </div>
      <MeatArt d={mineD ? mineD.d : playD} sizzle={playing && !done && !over} />
      {/* 결과 문구 칸 — 비어 있어도 자리를 차지 */}
      <p className={`meat-label${mineD && !view.spectating ? ` ${mineD.level}` : ''}`} data-meat-label>
        {mineD && !view.spectating ? mineD.label : ''}
      </p>
      <p className={`cake-help${hidden && !done && !over ? ' breathe' : ''}`}>{help}</p>
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
