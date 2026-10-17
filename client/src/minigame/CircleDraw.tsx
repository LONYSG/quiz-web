// =============================================================================
// ★★★ 완벽한 원 (R051 · D-237) — 한 번에 그린 원의 원다움
//
// ★ 화면: 정사각형 캔버스 하나 · 누른 채 그리고 떼면 끝(한 번만). 8초 안에 못 떼면 그때까지의 선으로.
//   점이 20개가 안 되면(살짝 톡) 보내지 않고 다시 그릴 수 있다(판단 — 실수 한 번으로 판을 날리지 않게).
// ★ 보내는 것 = 점 배열 [x, y, t](캔버스 0~1 · 판 시작부터 기기 ms)뿐 — 점수는 서버가 다시 계산한다.
//   내 화면에는 같은 함수(shared circleScore)로 바로 "92.3%" 와 맞춘 원을 보여 준다.
// ★ 모바일: 손가락으로 그리는 동안 화면이 스크롤되지 않게(touch-action: none · 포인터 잡기).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { CIRCLE_MAX_POINTS, CIRCLE_MIN_POINTS, circleScore, type CircleFit } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

type P3 = [number, number, number];

export default function CircleDraw({ socket, view, serverNow, mobile }: Props) {
  const playMs = view.round?.playMs ?? 8000;
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const svgRef = useRef<SVGSVGElement>(null);
  const ptsRef = useRef<P3[]>([]);
  const drawingRef = useRef(false);
  const [path, setPath] = useState('');
  const [result, setResult] = useState<{ key: string; fit: CircleFit } | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const mine = result?.key === key ? result : null;
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    ptsRef.current = [];
    drawingRef.current = false;
    setPath('');
    setTooShort(false);
  }, [key]);

  const elapsed = t0 !== null ? Math.max(0, now - t0) : 0;
  const over = elapsed >= playMs;

  const toPath = (pts: P3[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join(' ');

  const finish = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    let pts = ptsRef.current;
    if (pts.length < CIRCLE_MIN_POINTS) {
      ptsRef.current = [];
      setPath('');
      setTooShort(true);
      return;
    }
    if (sentRef.current === key) return;
    if (pts.length > CIRCLE_MAX_POINTS) {
      const step = pts.length / CIRCLE_MAX_POINTS;
      const out: P3[] = [];
      for (let i = 0; i < CIRCLE_MAX_POINTS; i += 1) out.push(pts[Math.floor(i * step)]!);
      out[out.length - 1] = pts[pts.length - 1]!;
      pts = out;
    }
    sentRef.current = key;
    const fit = circleScore(pts.map(([x, y]) => ({ x, y })));
    setResult({ key, fit });
    sfx('mg-done');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { points: pts } });
  };

  // 8초가 지나면 그때까지의 선으로
  useEffect(() => {
    if (over && drawingRef.current) finish();
  });

  const point = (e: { clientX: number; clientY: number }): P3 | null => {
    const svg = svgRef.current;
    if (!svg || t0 === null) return null;
    const r = svg.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const t = Math.min(playMs, performance.now() - t0);
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000, Math.round(t * 10) / 10];
  };

  const add = (e: React.PointerEvent) => {
    const list = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const evs = list.length > 0 ? list : [e.nativeEvent];
    for (const ev of evs) {
      const p = point(ev);
      if (!p) continue;
      const last = ptsRef.current[ptsRef.current.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      if (last && p[2] < last[2]) p[2] = last[2];
      ptsRef.current.push(p);
    }
    setPath(toPath(ptsRef.current));
  };

  const fit = mine?.fit;

  return (
    <div className={`circle-stage${mobile ? ' m' : ''}${mine ? ' done' : ''}`} data-done={mine ? '1' : '0'}>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${(mine ? 0 : Math.max(0, 1 - elapsed / playMs)) * 100}%` }} />
      </div>
      <svg
        ref={svgRef}
        className="circle-pad"
        viewBox="0 0 100 100"
        role="img"
        aria-label="원을 그리는 칸"
        onPointerDown={(e) => {
          if (!canPlay || mine || over || t0 === null) return;
          e.preventDefault();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          drawingRef.current = true;
          ptsRef.current = [];
          setTooShort(false);
          add(e);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return;
          e.preventDefault();
          add(e);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <circle cx="50" cy="50" r="1.2" className="circle-dot" />
        {fit && fit.r > 0 && fit.r < 1.5 && (
          <circle cx={fit.cx * 100} cy={fit.cy * 100} r={fit.r * 100} className="circle-fit" />
        )}
        {path && <path d={path} className="circle-ink" />}
      </svg>
      <p className="circle-help">
        {view.spectating ? (
          '구경 중이에요'
        ) : mine ? (
          <>
            <strong className="mono circle-score">{mine.fit.score.toFixed(1)}%</strong>
            {mine.fit.flaw === 'open' ? ' · 덜 닫혔어요' : mine.fit.flaw === 'small' ? ' · 너무 작아요' : mine.fit.flaw === 'line' ? ' · 원이 아니에요' : ''}
          </>
        ) : over ? (
          '시간이 끝났어요'
        ) : tooShort ? (
          <span className="typing-warn">너무 짧아요 — 다시 그리세요</span>
        ) : mobile ? (
          '손가락으로 한 번에 원을 그리고 떼세요'
        ) : (
          '마우스를 누른 채 한 번에 원을 그리고 떼세요'
        )}
      </p>
    </div>
  );
}
