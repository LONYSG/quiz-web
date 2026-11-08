// =============================================================================
// ★★★ 캐치마인드 화면 (R083 · D-340) — 판 자리 = 정사각 캔버스 · 채팅은 그대로 아래(높이를 줄임 — styles R083)
//
// ★ 출제자: 포인터로 그림(마우스 · 터치 · 펜) · 선 = 논리 좌표 0~1000 점 배열 · 그리는 중 200ms 마다 조각을 보내고 손을 떼면 마지막 조각
//   · 도구 = 색 4 · 굵기 2 · 지우개 · 전체 지우기 · "다른 제시어"(처음 10초 · 선이 없을 때 1회)
// ★ 나머지: 선 조각(draw.stroke)을 받아 그린다 · 늦게 들어오면 view.strokes 로 전부 · 정답은 채팅에 그대로(맞히면 그 글은 안 보이고 시스템 줄)
// ★ 상태는 글자 + 기호(사무실 흑백 — D-324): 맞힌 사람 ✓ · 출제자 ✎.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { DRAW, DRAW_COLORS, DRAW_WIDTHS } from '@quiz/shared';
import type { DrawStrokeView, DrawView, PlayerView } from './useRoom.js';

interface Props {
  socket: Socket;
  view: DrawView;
  players: PlayerView[];
  myAccountId: string;
  serverNow: () => number;
}

const COLOR_NAME: Record<string, string> = { '#111111': '검정', '#e5383b': '빨강', '#2563eb': '파랑', '#16a34a': '초록' };

function paint(ctx: CanvasRenderingContext2D, w: number, strokes: readonly DrawStrokeView[]) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, w);
  const k = w / DRAW.SIZE;
  for (const s of strokes) {
    if (s.pts.length < 2) continue;
    ctx.globalCompositeOperation = s.color === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color === 'erase' ? '#000' : s.color;
    ctx.lineWidth = s.width * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s.pts[0]! * k, s.pts[1]! * k);
    if (s.pts.length === 2) ctx.lineTo(s.pts[0]! * k + 0.01, s.pts[1]! * k);
    for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i]! * k, s.pts[i + 1]! * k);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export default function DrawStage({ socket, view, players, serverNow }: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, []);
  const left = Math.max(0, Math.ceil((view.phaseEndsAt - serverNow()) / 1000));
  const frac = Math.max(0, Math.min(1, (view.phaseEndsAt - serverNow()) / Math.max(1, view.phaseEndsAt - view.phaseStartedAt)));
  const nameOf = (id: string | null) => (id ? (players.find((p) => p.accountId === id)?.nickname ?? '나간 사람') : '');
  const colorOf = (id: string) => `var(--p${players.find((p) => p.accountId === id)?.colorIndex ?? 0})`;
  const canDraw = view.amDrawer && view.phase === 'draw';

  // ── 선 모음(라운드마다 view.strokes 로 시작 · 조각 이벤트로 이어 붙임)
  const strokes = useRef<DrawStrokeView[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const roundKey = `${view.round}:${view.phase === 'reveal' ? 'r' : 'd'}`;
  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) paint(ctx, c.width, strokes.current);
  }, []);
  useEffect(() => {
    strokes.current = view.strokes.map((s) => ({ ...s, pts: [...s.pts] }));
    redraw();
    // ★ 라운드 · 단계가 바뀔 때만 서버 사본으로(그리는 중 보낸 조각이 사라지지 않게) — 늦게 들어오면 처음 그릴 때 전부
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);
  useEffect(() => {
    const onStroke = (p: { round: number; id: string; color: string; width: number; pts: number[] }) => {
      if (p.round !== view.round) return;
      let s = strokes.current.find((x) => x.id === p.id);
      if (!s) strokes.current.push((s = { id: p.id, color: p.color, width: p.width, pts: [] }));
      if (!mine.current.has(p.id)) s.pts.push(...p.pts);
      redraw();
    };
    const onClear = (p: { round: number }) => {
      if (p.round !== view.round) return;
      strokes.current = [];
      redraw();
    };
    socket.on('draw.stroke', onStroke);
    socket.on('draw.clear', onClear);
    return () => {
      socket.off('draw.stroke', onStroke);
      socket.off('draw.clear', onClear);
    };
  }, [socket, view.round, redraw]);
  // 캔버스 픽셀 크기 = 화면 크기(선명하게)
  useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    const fit = () => {
      const w = Math.round(c.getBoundingClientRect().width * (window.devicePixelRatio || 1));
      // ★ 높이도 같이 본다 — 폭이 이미 같으면 높이가 기본 150 에 남아 남의 화면에서 그림이 세로로 늘어났다(그림에서 찾음)
      if (w > 0 && (c.width !== w || c.height !== w)) {
        c.width = w;
        c.height = w;
        redraw();
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  // ── 출제자 그리기
  const [color, setColor] = useState<string>(DRAW_COLORS[0]);
  const [width, setWidth] = useState<number>(DRAW_WIDTHS[0]);
  const mine = useRef(new Set<string>());
  const cur = useRef<{ id: string; pending: number[]; last: number; lx: number; ly: number } | null>(null);
  const toLogical = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(DRAW.SIZE, Math.round(v)));
    return [clamp(((e.clientX - r.left) / r.width) * DRAW.SIZE), clamp(((e.clientY - r.top) / r.height) * DRAW.SIZE)] as const;
  };
  const flush = (final: boolean) => {
    const c = cur.current;
    if (!c || c.pending.length === 0) return;
    socket.emit('draw.stroke', { id: c.id, color, width, pts: c.pending });
    c.pending = [];
    c.last = performance.now();
    if (final) cur.current = null;
  };
  const down = (e: React.PointerEvent) => {
    if (!canDraw || e.button > 0) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [x, y] = toLogical(e);
    const id = `${view.round}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    mine.current.add(id);
    cur.current = { id, pending: [x, y], last: performance.now(), lx: x, ly: y };
    strokes.current.push({ id, color, width, pts: [x, y] });
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    const c = cur.current;
    if (!c || !canDraw) return;
    const [x, y] = toLogical(e);
    if (Math.hypot(x - c.lx, y - c.ly) < 3) return;
    c.lx = x;
    c.ly = y;
    c.pending.push(x, y);
    strokes.current.find((s) => s.id === c.id)?.pts.push(x, y);
    redraw();
    if (performance.now() - c.last > DRAW.CHUNK_MS || c.pending.length >= DRAW.MAX_CHUNK * 2 - 2) flush(false);
  };
  const up = () => flush(true);

  const solvedIds = new Set(view.solved.map((s) => s.accountId));
  return (
    <section className={`card draw-card draw-${view.phase}`} data-draw-phase={view.phase} aria-live="polite">
      <header className="liar-head">
        <span className="mg-badge">캐치마인드</span>
        <span className="mono liar-round">
          {view.round} / {view.rounds}
        </span>
        <span className="draw-who">
          ✎ <strong style={{ color: colorOf(view.drawer) }}>{nameOf(view.drawer)}</strong>
        </span>
        <span className="mg-spacer" />
        <span className="mono liar-left">{left}초</span>
      </header>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${frac * 100}%` }} />
      </div>
      <p className="draw-word">
        주제 <strong data-draw-topic>{view.nameKo}</strong>
        {view.keyword ? (
          <>
            {' '}
            · {view.phase === 'reveal' ? '정답' : '그릴 것'}{' '}
            <strong className="draw-keyword" data-draw-keyword title={view.amDrawer && view.phase === 'draw' ? '채팅은 돼요 — 제시어 · 글자 수는 말할 수 없어요' : undefined}>
              {view.keyword}
            </strong>
          </>
        ) : view.mySolved ? (
          <span className="draw-mine-ok"> · ✓ 맞혔어요!</span>
        ) : view.spectating ? (
          <span className="dim"> · 구경 중</span>
        ) : (
          <span className="dim"> · 채팅으로 정답!</span>
        )}
        {view.canReroll && (
          <button type="button" className="ghost tiny" data-draw-reroll onClick={() => socket.emit('draw.reroll', {})}>
            다른 제시어
          </button>
        )}
      </p>
      <div className="draw-wrap">
        <canvas
          ref={canvas}
          className={canDraw ? 'draw-canvas can' : 'draw-canvas'}
          data-draw-canvas
          data-strokes={strokes.current.length}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={(e) => e.buttons === 0 && up()}
        />
      </div>
      {canDraw && (
        <div className="draw-tools" data-draw-tools>
          {DRAW_COLORS.map((c) => (
            <button key={c} type="button" className={color === c ? 'draw-tool on' : 'draw-tool'} aria-label={COLOR_NAME[c]} title={COLOR_NAME[c]} data-draw-color={c} onClick={() => setColor(c)}>
              <span className="draw-swatch" style={{ background: c }} />
            </button>
          ))}
          <button type="button" className={color === 'erase' ? 'draw-tool on' : 'draw-tool'} data-draw-color="erase" onClick={() => setColor('erase')}>
            지우개
          </button>
          {DRAW_WIDTHS.map((w, i) => (
            <button key={w} type="button" className={width === w ? 'draw-tool on' : 'draw-tool'} data-draw-width={w} onClick={() => setWidth(w)}>
              {i === 0 ? '가늘게' : '굵게'}
            </button>
          ))}
          <button type="button" className="draw-tool" data-draw-clear onClick={() => socket.emit('draw.clear', {})}>
            전체 지우기
          </button>
        </div>
      )}
      <p className="draw-solved" data-draw-solved={view.solved.length}>
        {view.participants
          .filter((a) => a !== view.drawer)
          .map((a) => (
            <span key={a} className={solvedIds.has(a) ? 'ok' : 'dim'} style={{ color: solvedIds.has(a) ? colorOf(a) : undefined }}>
              {solvedIds.has(a) ? '✓ ' : ''}
              {nameOf(a)}
              {view.scores?.[a] ? ` +${view.scores[a]}` : ''}
            </span>
          ))}
        {view.phase === 'reveal' && view.scores?.[view.drawer] ? (
          <span>
            ✎ {nameOf(view.drawer)} +{view.scores[view.drawer]}
          </span>
        ) : null}
      </p>
    </section>
  );
}
