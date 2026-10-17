// =============================================================================
// ★★★ 각도 맞추기 (R051 · D-237) — 제시 각도를 손으로 만들기
//
// ★ 화면: 목표 각도 숫자("37°") · 꼭짓점 + 오른쪽 기준 반직선(고정) · 다른 반직선(끝을 끈다) · 눈금 없음.
//   PC ← → 0.5°씩(꾹 누르면 빨라진다 · ← 가 반시계 = 각이 커진다) · 마우스로 끌어도 된다 · Space / Enter 확정.
//   모바일: 선 끝(또는 판 아무 곳)을 손가락으로 끌고 확정 버튼.
// ★ 보내기: 움직이는 동안 0.25초마다 지금 각(임시) · 확정하면 그 각(확정) · 10초가 끝나면 마지막 각(서버가 마감 때 마지막 임시 값을 쓴다).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ANGLE_KEY_STEP, angleOfPoint, clampAngle } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

/** 그림 좌표 — viewBox 0 0 200 120 · 꼭짓점 (100, 108) · 반직선 길이 88 */
export const ANGLE_VX = 100;
export const ANGLE_VY = 108;
export const ANGLE_LEN = 88;
export function rayEnd(deg: number, len = ANGLE_LEN): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  return { x: ANGLE_VX + Math.cos(r) * len, y: ANGLE_VY - Math.sin(r) * len };
}

export default function AngleMatch({ socket, view, serverNow, mobile }: Props) {
  const target = Number(view.round?.params?.target ?? 45);
  const start = Number((view.round?.private?.start as number | undefined) ?? 90);
  const playMs = view.round?.playMs ?? 10000;
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const [deg, setDeg] = useState(start);
  const degRef = useRef(deg);
  degRef.current = deg;
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const done = confirmed === key;
  const dirty = useRef(false);
  const dragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setDeg(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const elapsed = t0 !== null ? Math.max(0, now - t0) : 0;
  const over = elapsed >= playMs;

  const send = (final: boolean) => {
    socket.emit('minigame.submit', {
      token: view.token,
      roundIndex: view.roundIndex,
      input: { deg: Math.round(degRef.current * 1000) / 1000, final, elapsedMs: t0 !== null ? Math.round(performance.now() - t0) : null },
    });
  };

  // 임시 값 0.25초마다 · 처음 한 번
  useEffect(() => {
    if (!canPlay) return undefined;
    send(false);
    const iv = window.setInterval(() => {
      if (done) return;
      if (dirty.current) {
        dirty.current = false;
        send(false);
      }
    }, 250);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, key, done]);

  const set = (d: number) => {
    if (!canPlay || done || over) return;
    const nd = clampAngle(Math.round(d * 1000) / 1000);
    if (Math.abs(nd - degRef.current) < 1e-6) return;
    degRef.current = nd;
    setDeg(nd);
    dirty.current = true;
  };

  const confirm = () => {
    if (!canPlay || done || over) return;
    setConfirmed(key);
    sfx('mg-done');
    send(true);
  };

  // 키보드 — 꾹 누르면 빨라진다
  const holdRef = useRef<{ key: string; n: number } | null>(null);
  useEffect(() => {
    if (!canPlay) return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) confirm();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const h = holdRef.current?.key === e.key && e.repeat ? holdRef.current : { key: e.key, n: 0 };
      h.n += 1;
      holdRef.current = h;
      const step = e.repeat ? Math.min(4, ANGLE_KEY_STEP + h.n * 0.15) : ANGLE_KEY_STEP;
      set(degRef.current + (e.key === 'ArrowLeft' ? step : -step));
      if (!e.repeat || h.n % 4 === 0) sfx('mg-move');
    };
    window.addEventListener('keydown', onDown, true);
    return () => window.removeEventListener('keydown', onDown, true);
  });

  const fromPointer = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 200;
    const y = ((e.clientY - r.top) / r.height) * 120;
    set(angleOfPoint(x - ANGLE_VX, ANGLE_VY - y));
  };

  const end = rayEnd(deg);
  const base = rayEnd(0);

  return (
    <div className={`angle-stage${mobile ? ' m' : ''}${done ? ' done' : ''}`} data-done={done ? '1' : '0'}>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${(done ? 0 : Math.max(0, 1 - elapsed / playMs)) * 100}%` }} />
      </div>
      <p className="angle-target mono">
        {target}
        <span className="angle-deg">°</span>
      </p>
      <svg
        ref={svgRef}
        className="angle-pad"
        viewBox="0 0 200 120"
        role="img"
        aria-label="각도를 만드는 칸"
        onPointerDown={(e) => {
          if (!canPlay || done || over) return;
          e.preventDefault();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          dragging.current = true;
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          e.preventDefault();
          fromPointer(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <line x1={ANGLE_VX} y1={ANGLE_VY} x2={base.x} y2={base.y} className="angle-ray base" />
        <line x1={ANGLE_VX} y1={ANGLE_VY} x2={end.x} y2={end.y} className="angle-ray mine" />
        <circle cx={ANGLE_VX} cy={ANGLE_VY} r={2.6} className="angle-vertex" />
        <g className="angle-handle" transform={`translate(${end.x} ${end.y})`}>
          <circle r={9} className="angle-handle-hit" />
          <circle r={4.2} className="angle-handle-dot" />
        </g>
      </svg>
      <div className="angle-foot">
        <p className="angle-help">
          {view.spectating
            ? '구경 중이에요'
            : done
              ? '확정! 다른 사람을 기다리는 중…'
              : over
                ? '시간이 끝났어요 — 마지막 각으로'
                : mobile
                  ? '선 끝을 끌어 각을 만들고 확정'
                  : '← → (꾹 누르면 빨라요) · 마우스로 끌기 · Space / Enter 확정'}
        </p>
        {canPlay && !done && !over && (
          <button type="button" className="primary angle-ok" onClick={confirm}>
            확정
          </button>
        )}
      </div>
    </div>
  );
}
