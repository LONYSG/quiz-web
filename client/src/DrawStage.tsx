// =============================================================================
// ★★★ 캐치마인드 화면 (R083 · D-340) — 판 자리 = 정사각 캔버스
//
// ★ 출제자: 포인터로 그림(마우스 · 터치 · 펜) · 선 = 논리 좌표 0~1000 점 배열 · 그리는 중 DRAW.CHUNK_MS 마다 조각을 보내고 손을 떼면 마지막 조각
//   · 도구 = 색 4 · 굵기 2 · 지우개 · 전체 지우기 · "다른 제시어"(처음 10초 · 선이 없을 때 1회)
// ★ 나머지: 선 조각(draw.stroke)을 받아 그린다 · 늦게 들어오면 view.strokes 로 전부 · 정답은 채팅에 그대로(맞히면 그 글은 안 보이고 시스템 줄)
// ★★ R087 (D-344 · 찬종 테스트 1)
//   · 그림판 크게: PC 는 채팅을 옆으로(styles R087) · 주제 줄을 머리에 합침 · 도구 · 맞힌 사람은 옆 기둥 · 캔버스 = 남는 자리의 정사각 최대(ResizeObserver)
//     모바일 = 화면 너비 전체 · 도구 · 맞힌 사람은 아래
//   · 선 매끄럽게: 조각 50ms · getCoalescedEvents 로 점 전부 · 2차 곡선(중점법) · requestAnimationFrame 으로 묶어 그림 · 출제자 화면도 같은 경로
//   · 힌트 버튼 셋(출제자만 · 각 1회 · 패널티 없음): 글자 수 · 초성 · 주제 — 주제는 기본 숨김
// ★ 상태는 글자 + 기호(사무실 흑백 — D-324): 맞힌 사람 ✓ · 출제자 ✎.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { DRAW, DRAW_COLORS, DRAW_HINT_KINDS, DRAW_HINT_LABEL, DRAW_WIDTHS } from '@quiz/shared';
import type { DrawStrokeView, DrawView, PlayerView } from './useRoom.js';

interface Props {
  socket: Socket;
  view: DrawView;
  players: PlayerView[];
  myAccountId: string;
  serverNow: () => number;
}

const COLOR_NAME: Record<string, string> = { '#111111': '검정', '#e5383b': '빨강', '#2563eb': '파랑', '#16a34a': '초록' };

/** ★ R087 — 점 사이를 2차 곡선(중점법)으로 · 조각 경계에서 끊지 않는다(선 하나 = 경로 하나) */
function paint(ctx: CanvasRenderingContext2D, w: number, strokes: readonly DrawStrokeView[]) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, w);
  const k = w / DRAW.SIZE;
  for (const s of strokes) {
    const p = s.pts;
    if (p.length < 2) continue;
    ctx.globalCompositeOperation = s.color === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color === 'erase' ? '#000' : s.color;
    ctx.lineWidth = s.width * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p[0]! * k, p[1]! * k);
    const n = p.length / 2;
    if (n === 1) ctx.lineTo(p[0]! * k + 0.01, p[1]! * k);
    else if (n === 2) ctx.lineTo(p[2]! * k, p[3]! * k);
    else {
      for (let i = 1; i < n - 1; i += 1) {
        const x = p[i * 2]!;
        const y = p[i * 2 + 1]!;
        const mx = (x + p[i * 2 + 2]!) / 2;
        const my = (y + p[i * 2 + 3]!) / 2;
        ctx.quadraticCurveTo(x * k, y * k, mx * k, my * k);
      }
      ctx.lineTo(p[p.length - 2]! * k, p[p.length - 1]! * k);
    }
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
  const wrap = useRef<HTMLDivElement>(null);
  const roundKey = `${view.round}:${view.phase === 'reveal' ? 'r' : 'd'}`;
  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) paint(ctx, c.width, strokes.current);
  }, []);
  // ★ R087 — 그리기를 한 프레임에 한 번으로 묶는다(조각이 잦아져도 매끄럽게)
  const raf = useRef(0);
  const schedule = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      redraw();
    });
  }, [redraw]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
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
      schedule();
    };
    const onClear = (p: { round: number }) => {
      if (p.round !== view.round) return;
      strokes.current = [];
      schedule();
    };
    socket.on('draw.stroke', onStroke);
    socket.on('draw.clear', onClear);
    return () => {
      socket.off('draw.stroke', onStroke);
      socket.off('draw.clear', onClear);
    };
  }, [socket, view.round, schedule]);
  // ★ R087 — 캔버스 = 자리(wrap)의 정사각 최대 · 픽셀 = 화면 크기 × 배율(선명하게)
  const [side, setSide] = useState(0);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const s = Math.max(160, Math.floor(Math.min(r.width, r.height)));
      setSide((old) => (old === s ? old : s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c || side <= 0) return;
    const px = Math.round(side * (window.devicePixelRatio || 1));
    if (c.width !== px || c.height !== px) {
      c.width = px;
      c.height = px;
    }
    redraw();
  }, [side, redraw]);

  // ── 출제자 그리기
  const [color, setColor] = useState<string>(DRAW_COLORS[0]);
  const [width, setWidth] = useState<number>(DRAW_WIDTHS[0]);
  const mine = useRef(new Set<string>());
  const cur = useRef<{ id: string; pending: number[]; last: number; lx: number; ly: number } | null>(null);
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(DRAW.SIZE, Math.round(v)));
    return [clamp(((e.clientX - r.left) / r.width) * DRAW.SIZE), clamp(((e.clientY - r.top) / r.height) * DRAW.SIZE)] as const;
  };
  const flush = (final: boolean) => {
    const c = cur.current;
    if (!c) return;
    if (c.pending.length > 0) {
      socket.emit('draw.stroke', { id: c.id, color, width, pts: c.pending });
      c.pending = [];
      c.last = performance.now();
    }
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
    schedule();
  };
  const move = (e: React.PointerEvent) => {
    const c = cur.current;
    if (!c || !canDraw) return;
    // ★ R087 — 브라우저가 한 프레임에 합친 점까지 전부(빠르게 그어도 각지지 않게)
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    const list = evs.length ? evs : [e.nativeEvent as PointerEvent];
    const s = strokes.current.find((x) => x.id === c.id);
    for (const ev of list) {
      const [x, y] = toLogical(ev);
      if (Math.hypot(x - c.lx, y - c.ly) < 2) continue;
      c.lx = x;
      c.ly = y;
      c.pending.push(x, y);
      s?.pts.push(x, y);
    }
    schedule();
    if (performance.now() - c.last >= DRAW.CHUNK_MS || c.pending.length >= DRAW.MAX_CHUNK * 2 - 2) flush(false);
  };
  const up = () => flush(true);

  const solvedIds = new Set(view.solved.map((s) => s.accountId));
  const hintChips = DRAW_HINT_KINDS.filter((k) => view.hints[k]);
  return (
    <section className={`card draw-card draw-${view.phase}`} data-draw-phase={view.phase} aria-live="polite">
      <header className="liar-head draw-head">
        <span className="mg-badge">캐치마인드</span>
        <span className="mono liar-round">
          {view.round} / {view.rounds}
        </span>
        <span className="draw-who">
          ✎ <strong style={{ color: colorOf(view.drawer) }}>{nameOf(view.drawer)}</strong>
        </span>
        <span className="draw-word">
          {view.nameKo ? (
            <span>
              주제 <strong data-draw-topic>{view.nameKo}</strong>
              {view.amDrawer && view.phase === 'draw' && !view.hints.topic && <span className="dim draw-secret"> (비공개)</span>}
            </span>
          ) : (
            <span className="dim" data-draw-topic-hidden>
              주제 ?
            </span>
          )}
          {view.keyword ? (
            <span>
              · {view.phase === 'reveal' ? '정답' : '그릴 것'}{' '}
              <strong className="draw-keyword" data-draw-keyword title={view.amDrawer && view.phase === 'draw' ? '채팅은 돼요 — 제시어 · 글자 수는 말할 수 없어요(힌트는 버튼으로)' : undefined}>
                {view.keyword}
              </strong>
            </span>
          ) : view.mySolved ? (
            <span className="draw-mine-ok">· ✓ 맞혔어요!</span>
          ) : view.spectating ? (
            <span className="dim">· 구경 중</span>
          ) : (
            <span className="dim">· 채팅으로 정답!</span>
          )}
          {view.phase === 'reveal' && view.diff ? (
            <span className="dim draw-diff" data-draw-diff={view.diff}>
              · {['', '쉬움', '보통', '어려움'][view.diff]}
            </span>
          ) : null}
          {view.canReroll && (
            <button type="button" className="ghost tiny" data-draw-reroll onClick={() => socket.emit('draw.reroll', {})}>
              다른 제시어
            </button>
          )}
        </span>
        <span className="mg-spacer" />
        <span className="mono liar-left">{left}초</span>
      </header>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${frac * 100}%` }} />
      </div>
      {hintChips.length > 0 && view.phase === 'draw' && (
        <p className="draw-hints" data-draw-hints={hintChips.join(',')}>
          {hintChips.map((k) => (
            <span key={k} className="draw-hint-chip" data-draw-hint={k}>
              {DRAW_HINT_LABEL[k]} <strong>{view.hints[k]}</strong>
            </span>
          ))}
        </p>
      )}
      <div className="draw-body">
        <div className="draw-wrap" ref={wrap}>
          <canvas
            ref={canvas}
            className={canDraw ? 'draw-canvas can' : 'draw-canvas'}
            style={side > 0 ? { width: side, height: side } : undefined}
            data-draw-canvas
            data-side={side}
            data-strokes={strokes.current.length}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={(e) => e.buttons === 0 && up()}
          />
        </div>
        <div className="draw-side">
          {canDraw && (
            <div className="draw-tools" data-draw-tools>
              {DRAW_COLORS.map((c) => (
                <button key={c} type="button" className={color === c ? 'draw-tool on' : 'draw-tool'} aria-label={COLOR_NAME[c]} title={COLOR_NAME[c]} data-draw-color={c} onClick={() => setColor(c)}>
                  <span className="draw-swatch" style={{ background: c }} />
                </button>
              ))}
              {DRAW_WIDTHS.map((w, i) => (
                <button key={w} type="button" className={width === w ? 'draw-tool on' : 'draw-tool'} data-draw-width={w} onClick={() => setWidth(w)}>
                  {i === 0 ? '가늘게' : '굵게'}
                </button>
              ))}
              <button type="button" className={color === 'erase' ? 'draw-tool on' : 'draw-tool'} data-draw-color="erase" onClick={() => setColor('erase')}>
                지우개
              </button>
              <button type="button" className="draw-tool" data-draw-clear onClick={() => socket.emit('draw.clear', {})}>
                전체 지우기
              </button>
              <span className="draw-tool-label dim">힌트</span>
              {DRAW_HINT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="draw-tool draw-hint-btn"
                  data-draw-hint-btn={k}
                  disabled={!view.hintsLeft.includes(k)}
                  title={view.hintsLeft.includes(k) ? `${DRAW_HINT_LABEL[k]} 공개(1회)` : '이미 공개했어요'}
                  onClick={() => socket.emit('draw.hint', { kind: k })}
                >
                  {view.hintsLeft.includes(k) ? '' : '✓ '}
                  {DRAW_HINT_LABEL[k]}
                </button>
              ))}
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
        </div>
      </div>
    </section>
  );
}
