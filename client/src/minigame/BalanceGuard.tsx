// =============================================================================
// ★★★ 균형의수호자 (가제 · 마리오 파티 잼버리 'Prime Cut' 1인판) — R050 · D-235
//
// ★ 화면: 물건(BalanceArt) 위 · 아래에 수평선 · 각 선에 점 하나(사람마다 다른 시작 위치 — 서버가 정해 준다) · 두 점을 잇는 점선 = 자를 선.
// ★ 조작 (찬종: "위 아래 지점을 키보드 좌우로 움직일 수 있고 위 아래는 키보드 상하 키로 전환")
//   PC: ← → 지금 점 옮기기(꾹 누르면 빨라진다 · 짧게 누르면 미세) · ↑ ↓ 위/아래 점 바꾸기 · 마우스로 끌어도 된다
//   모바일: 두 점을 손가락으로 직접 끈다(점 둘레 넓은 터치 자리)
// ★ 보내기: 움직이는 동안 0.25초마다 지금 위치(임시) · 10초가 끝나면 마지막 위치(확정). 서버는 마감 때 마지막 위치로 넓이를 다시 잰다.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { BALANCE_BOTTOM_Y, BALANCE_TOP_Y, balanceItem, clampCutX, type BalanceCut, type BalanceKind } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import BalanceArt from './BalanceArt.js';
import { typingTarget } from '../reportGuard.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

/** 자를 선을 viewBox 위 · 아래 끝까지 늘린 두 점 */
export function cutLine(cut: BalanceCut) {
  return { x1: cut.top, y1: BALANCE_TOP_Y, x2: cut.bottom, y2: BALANCE_BOTTOM_Y };
}

export default function BalanceGuard({ socket, view, serverNow, mobile }: Props) {
  const params = view.round?.params ?? {};
  const kind = String(params.kind ?? 'steak') as BalanceKind;
  const seed = Number(params.itemSeed ?? 1);
  const item = useMemo(() => balanceItem(kind, seed), [kind, seed]);
  const start = (view.round?.private?.start as BalanceCut | undefined) ?? { top: 30, bottom: 70 };
  const key = `${view.token}:${view.roundIndex}`;
  const playing = view.phase === 'play' && !view.spectating;

  const [cut, setCut] = useState<BalanceCut>(start);
  const [active, setActive] = useState<'top' | 'bottom'>('top');
  const activeRef = useRef(active);
  activeRef.current = active;
  // 판이 바뀌면 시작 점으로
  useEffect(() => {
    setCut(start);
    setActive('top');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── 보내기 (임시 0.25초마다 · 확정은 마감)
  const cutRef = useRef(cut);
  cutRef.current = cut;
  const t0Ref = useRef<{ key: string; t0: number } | null>(null);
  if (view.phase === 'play' && t0Ref.current?.key !== key) {
    t0Ref.current = { key, t0: view.receivedAt ?? performance.now() - Math.max(0, serverNow() - view.phaseStartedAt) };
  }
  const playMs = view.round?.playMs ?? 10000;
  const sentFinal = useRef<string | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (!playing) return undefined;
    const send = (final: boolean) => {
      const t0 = t0Ref.current?.t0 ?? performance.now();
      socket.emit('minigame.submit', {
        token: view.token,
        roundIndex: view.roundIndex,
        input: { top: cutRef.current.top, bottom: cutRef.current.bottom, final, elapsedMs: Math.round(performance.now() - t0) },
      });
    };
    send(false);
    const iv = setInterval(() => {
      const t0 = t0Ref.current?.t0 ?? performance.now();
      if (performance.now() - t0 >= playMs) {
        if (sentFinal.current !== key) {
          sentFinal.current = key;
          send(true);
        }
        return;
      }
      if (dirty.current) {
        dirty.current = false;
        send(false);
      }
    }, 120);
    return () => clearInterval(iv);
  }, [playing, key, playMs, socket, view.token, view.roundIndex]);

  const move = (which: 'top' | 'bottom', x: number) => {
    setCut((c) => {
      const nx = clampCutX(x);
      if (Math.abs(nx - c[which]) < 1e-6) return c;
      dirty.current = true;
      return { ...c, [which]: nx };
    });
  };

  // ── 키보드 (PC) — 꾹 누르면 빨라진다
  const holdRef = useRef<{ key: string; n: number } | null>(null);
  useEffect(() => {
    if (!playing) return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (typingTarget(e)) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const next = e.key === 'ArrowUp' ? 'top' : 'bottom';
        activeRef.current = next;
        setActive(next);
        return;
      }
      const h = holdRef.current?.key === e.key && e.repeat ? holdRef.current : { key: e.key, n: 0 };
      h.n += 1;
      holdRef.current = h;
      // 첫 누름 0.2 · 꾹 누르면 점점 빨라져 최대 1.6 (화면 폭의 %)
      const step = e.repeat ? Math.min(1.6, 0.25 + h.n * 0.06) : 0.2;
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const a = activeRef.current;
      move(a, cutRef.current[a] + dir * step);
      if (!e.repeat || h.n % 4 === 0) sfx('mg-move');
    };
    const onUp = (e: KeyboardEvent) => {
      if (holdRef.current?.key === e.key) holdRef.current = null;
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
  }, [playing]);

  // ── 끌기 (마우스 · 손가락)
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<'top' | 'bottom' | null>(null);
  const toX = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return 50;
    return ((clientX - r.left) / r.width) * 100;
  };
  const toY = (clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return 50;
    return ((clientY - r.top) / r.height) * 100;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!playing) return;
    const x = toX(e.clientX);
    const y = toY(e.clientY);
    // 가까운 점 (위 · 아래 선 근처면 그 선) — 터치는 넓게
    const dTop = Math.hypot(x - cut.top, y - BALANCE_TOP_Y);
    const dBot = Math.hypot(x - cut.bottom, y - BALANCE_BOTTOM_Y);
    const reach = mobile ? 22 : 14;
    let which: 'top' | 'bottom' | null = null;
    if (Math.min(dTop, dBot) < reach) which = dTop <= dBot ? 'top' : 'bottom';
    else if (y < 30) which = 'top';
    else if (y > 70) which = 'bottom';
    if (!which) return;
    e.preventDefault();
    drag.current = which;
    setActive(which);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    move(which, x);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !playing) return;
    e.preventDefault();
    move(drag.current, toX(e.clientX));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // 남은 시간
  const [, tick] = useState(0);
  useEffect(() => {
    if (view.phase !== 'play') return undefined;
    const iv = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(iv);
  }, [view.phase]);
  const t0 = t0Ref.current?.key === key ? t0Ref.current.t0 : performance.now();
  const leftMs = Math.max(0, playMs - (performance.now() - t0));
  const line = cutLine(cut);

  return (
    <div className="balance-stage">
      <div className="balance-timer" aria-hidden="true">
        <div className="balance-timer-fill" style={{ transform: `scaleX(${leftMs / playMs})` }} />
      </div>
      <p className="balance-title">
        <strong>{item.label}</strong> <span className="dim mono">{(leftMs / 1000).toFixed(1)}초</span>
      </p>
      <svg
        ref={svgRef}
        className="balance-svg"
        viewBox="0 0 100 100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label={`${item.label}를 반으로 — ${mobile ? '두 점을 끌어 옮기세요' : '← → 옮기기 · ↑ ↓ 점 바꾸기'}`}
      >
        <BalanceArt item={item} />
        {/* 위 · 아래 선 */}
        <line x1={0} y1={BALANCE_TOP_Y} x2={100} y2={BALANCE_TOP_Y} className="balance-rail" />
        <line x1={0} y1={BALANCE_BOTTOM_Y} x2={100} y2={BALANCE_BOTTOM_Y} className="balance-rail" />
        {/* 자를 선 */}
        <line {...line} className="balance-cut" />
        {(['top', 'bottom'] as const).map((w) => (
          <g key={w} className={`balance-handle${active === w ? ' active' : ''}`} transform={`translate(${cut[w]} ${w === 'top' ? BALANCE_TOP_Y : BALANCE_BOTTOM_Y})`}>
            <circle r={mobile ? 7 : 5} className="balance-handle-hit" />
            <circle r={2.6} className="balance-handle-dot" />
            {active === w && !mobile && <circle r={4.2} className="balance-handle-ring" />}
          </g>
        ))}
      </svg>
      <p className="balance-help">
        {view.spectating ? '구경 중이에요' : mobile ? '두 점을 손가락으로 끌어 옮기세요' : '← → 옮기기 · ↑ ↓ 위/아래 점 바꾸기'}
      </p>
    </div>
  );
}
