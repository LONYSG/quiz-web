// =============================================================================
// ★★★ 캐치마인드 화면 (R083 · D-340) — 판 자리 = 정사각 캔버스
//
// ★ 출제자: 포인터로 그림(마우스 · 터치 · 펜) · 선 = 논리 좌표 0~1000 점 배열 · 그리는 중 DRAW.CHUNK_MS 마다 조각을 보내고 손을 떼면 마지막 조각
// ★ 나머지: op 조각(draw.stroke · draw.fill · draw.undo · draw.clear)을 받아 그린다 · 늦게 들어오면 view.strokes(op 목록)로 전부 · 정답은 채팅에 그대로
// ★★ R087 (D-344): 그림판 크게(PC 채팅 옆 · 정사각 최대) · 선 매끄럽게(50ms · coalesced · 2차 곡선 · rAF) · 힌트 버튼 셋 · 주제 기본 숨김
// ★★★ R089 (D-346 · 찬종 "펜 굵기 · 되돌리기 · 색 팔레트 + 세부 색 · 지우개 굵기 · 페인트통 · 스포이드")
//   · 그리기 모델 = **op 목록 → 공용 1000×1000 격자**(오프스크린 · 흰 바탕) — 모든 화면이 같은 순서로 같은 격자에 그리고 화면에는 확대해 보인다
//     (기기 크기 · 배율이 달라도 결과가 같다 · 페인트통이 이 격자에서 채운다)
//   · 마지막 op 가 선이면 "그리는 중" — 격자에 넣지 않고 화면 위에만 그린다 · 다음 op 가 오면 그 선을 통째로 격자에 넣는다(조각 도착 시점이 달라도 같은 결과)
//   · 되돌리기(draw.undo) · 전체 지우기 = 격자를 op 목록으로 다시 그림
//   · 도구: 펜 · 지우개(흰 선) · 페인트통 · 스포이드(EyeDropper 있으면 화면 어디든 — 없으면 그림 안에서) · 굵기 5 · 팔레트 12 + 세부 색 · 최근 4 · 되돌리기 · 전체 지우기
//   · 단축키(채팅 입력 중이 아닐 때 · 출제자만): P 펜 · E 지우개 · B 페인트통 · I 스포이드 · [ ] 굵기 · Ctrl+Z 되돌리기
// ★ 상태는 글자 + 기호(사무실 흑백 — D-324): 맞힌 사람 ✓ · 출제자 ✎ · 도구는 글자 라벨.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { DRAW, DRAW_ERASE_HEX, DRAW_HINT_KINDS, DRAW_HINT_LABEL, DRAW_PALETTE, DRAW_WIDTH_STEPS, floodFill, gridHash, hexToRgb } from '@quiz/shared';
import type { DrawStrokeView, DrawView, PlayerView } from './useRoom.js';

interface Props {
  socket: Socket;
  view: DrawView;
  players: PlayerView[];
  myAccountId: string;
  serverNow: () => number;
}

type Tool = 'pen' | 'eraser' | 'fill' | 'pick';
const G = DRAW.SIZE;
const isFill = (s: DrawStrokeView) => s.kind === 'fill';
const colorOfOp = (c: string) => (c === 'erase' ? DRAW_ERASE_HEX : c);
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
const hex2 = (n: number) => n.toString(16).padStart(2, '0');
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = (): EyeDropperCtor | null => (typeof window !== 'undefined' && 'EyeDropper' in window ? ((window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper ?? null) : null);

/** ★ R087 — 선 하나 = 경로 하나 · 점 사이 2차 곡선(중점법) · k = 화면/격자 배율 */
function strokePath(ctx: CanvasRenderingContext2D, s: DrawStrokeView, k: number) {
  const p = s.pts;
  if (p.length < 2) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = colorOfOp(s.color);
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
      ctx.quadraticCurveTo(x * k, y * k, ((x + p[i * 2 + 2]!) / 2) * k, ((y + p[i * 2 + 3]!) / 2) * k);
    }
    ctx.lineTo(p[p.length - 2]! * k, p[p.length - 1]! * k);
  }
  ctx.stroke();
}

/** 공용 격자에 op 하나(선 = 경로 · 채우기 = 격자 픽셀에서 영역 채우기) */
function applyOp(g: CanvasRenderingContext2D, op: DrawStrokeView) {
  if (isFill(op)) {
    const img = g.getImageData(0, 0, G, G);
    floodFill(img.data, G, G, op.x ?? 0, op.y ?? 0, hexToRgb(op.color));
    g.putImageData(img, 0, 0);
  } else strokePath(g, op, 1);
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

  // ── op 목록 · 공용 격자(오프스크린 1000×1000 · 흰 바탕) · 격자에 넣은 op 수
  const ops = useRef<DrawStrokeView[]>([]);
  const grid = useRef<HTMLCanvasElement | null>(null);
  const done = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const gridCtx = () => {
    if (!grid.current) {
      const g = document.createElement('canvas');
      g.width = G;
      g.height = G;
      grid.current = g;
      done.current = -1;
    }
    return grid.current.getContext('2d', { willReadFrequently: true })!;
  };
  /** 격자를 op 목록에 맞춘다 — 마지막 선(그리는 중)은 빼고 · 되돌리기 · 지우기면 처음부터 */
  const sync = useCallback(() => {
    const g = gridCtx();
    const list = ops.current;
    const last = list[list.length - 1];
    const target = last && !isFill(last) && list.length - 1 >= Math.max(0, done.current) ? list.length - 1 : list.length;
    if (done.current < 0 || done.current > target) {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, G, G);
      done.current = 0;
    }
    for (let i = done.current; i < target; i += 1) applyOp(g, list[i]!);
    done.current = target;
    return target;
  }, []);
  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const target = sync();
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(grid.current!, 0, 0, c.width, c.height);
    const open = ops.current[target];
    if (open && !isFill(open)) strokePath(ctx, open, c.width / G);
  }, [sync]);
  // ★ R087 — 한 프레임에 한 번
  const raf = useRef(0);
  const schedule = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      redraw();
    });
  }, [redraw]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const roundKey = `${view.round}:${view.phase === 'reveal' ? 'r' : 'd'}`;
  useEffect(() => {
    ops.current = view.strokes.map((s) => ({ ...s, pts: [...s.pts] }));
    done.current = -1;
    redraw();
    // ★ 라운드 · 단계가 바뀔 때만 서버 사본으로(그리는 중 보낸 조각이 사라지지 않게) — 늦게 들어오면 처음 그릴 때 전부
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);
  useEffect(() => {
    const onStroke = (p: { round: number; id: string; color: string; width: number; pts: number[] }) => {
      if (p.round !== view.round) return;
      let s = ops.current.find((x) => x.id === p.id);
      if (!s) ops.current.push((s = { id: p.id, kind: 'stroke', color: p.color, width: p.width, pts: [] }));
      if (!mine.current.has(p.id)) s.pts.push(...p.pts);
      schedule();
    };
    const onFill = (p: { round: number; id: string; x: number; y: number; color: string }) => {
      if (p.round !== view.round || ops.current.some((x) => x.id === p.id)) return;
      ops.current.push({ id: p.id, kind: 'fill', color: p.color, width: 0, pts: [], x: p.x, y: p.y });
      schedule();
    };
    const onUndo = (p: { round: number; id: string }) => {
      if (p.round !== view.round) return;
      const i = ops.current.findIndex((x) => x.id === p.id);
      if (i < 0) return;
      ops.current.splice(i, 1);
      if (i < done.current) done.current = -1;
      if (cur.current?.id === p.id) cur.current = null;
      schedule();
    };
    const onClear = (p: { round: number }) => {
      if (p.round !== view.round) return;
      ops.current = [];
      done.current = -1;
      schedule();
    };
    socket.on('draw.stroke', onStroke);
    socket.on('draw.fill', onFill);
    socket.on('draw.undo', onUndo);
    socket.on('draw.clear', onClear);
    return () => {
      socket.off('draw.stroke', onStroke);
      socket.off('draw.fill', onFill);
      socket.off('draw.undo', onUndo);
      socket.off('draw.clear', onClear);
    };
  }, [socket, view.round, schedule]);
  // ★ 검사(ui-check r089) — 격자 해시(그리는 중인 마지막 선은 빼고 · 넣은 op 수와 함께)
  useEffect(() => {
    (window as unknown as { __drawGridHash?: () => string }).__drawGridHash = () => {
      const n = sync();
      return `${n}:${gridHash(gridCtx().getImageData(0, 0, G, G).data)}`;
    };
    return () => {
      delete (window as unknown as { __drawGridHash?: () => string }).__drawGridHash;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync]);
  // ★ R087 — 캔버스 = 자리(wrap)의 정사각 최대 · 픽셀 = 화면 크기 × 배율
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

  // ── 출제자 도구 ───────────────────────────────────────────────────────────
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColorRaw] = useState<string>(DRAW_PALETTE[0]);
  const [recent, setRecent] = useState<string[]>([]);
  const [penW, setPenW] = useState(1);
  const [eraseW, setEraseW] = useState(3);
  const setColor = (c: string) => {
    const h = c.toLowerCase();
    setColorRaw(h);
    if (!(DRAW_PALETTE as readonly string[]).includes(h)) setRecent((r) => [h, ...r.filter((x) => x !== h)].slice(0, 4));
    setTool((t) => (t === 'eraser' || t === 'pick' ? 'pen' : t));
  };
  const widthIdx = tool === 'eraser' ? eraseW : penW;
  const setWidthIdx = (i: number) => (tool === 'eraser' ? setEraseW : setPenW)(Math.max(0, Math.min(DRAW_WIDTH_STEPS.length - 1, i)));
  const mine = useRef(new Set<string>());
  const cur = useRef<{ id: string; pending: number[]; last: number; lx: number; ly: number; color: string; width: number } | null>(null);
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(G, Math.round(v)));
    return [clamp(((e.clientX - r.left) / r.width) * G), clamp(((e.clientY - r.top) / r.height) * G)] as const;
  };
  const newId = () => `${view.round}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const flush = (final: boolean) => {
    const c = cur.current;
    if (!c) return;
    if (c.pending.length > 0) {
      socket.emit('draw.stroke', { id: c.id, color: c.color, width: c.width, pts: c.pending });
      c.pending = [];
      c.last = performance.now();
    }
    if (final) cur.current = null;
  };
  /** 격자 픽셀 색(그림 안 스포이드) */
  const pickAt = (x: number, y: number) => {
    sync();
    const d = gridCtx().getImageData(Math.min(G - 1, x), Math.min(G - 1, y), 1, 1).data;
    setColor(`#${hex2(d[0]!)}${hex2(d[1]!)}${hex2(d[2]!)}`);
    setTool('pen');
  };
  const down = (e: React.PointerEvent) => {
    if (!canDraw || e.button > 0) return;
    e.preventDefault();
    const [x, y] = toLogical(e);
    if (tool === 'pick') {
      pickAt(x, y);
      return;
    }
    if (tool === 'fill') {
      const id = newId();
      flush(true);
      socket.emit('draw.fill', { id, x: Math.min(G - 1, x), y: Math.min(G - 1, y), color });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const id = newId();
    const c = tool === 'eraser' ? 'erase' : color;
    const w = DRAW_WIDTH_STEPS[widthIdx]!;
    mine.current.add(id);
    cur.current = { id, pending: [x, y], last: performance.now(), lx: x, ly: y, color: c, width: w };
    ops.current.push({ id, kind: 'stroke', color: c, width: w, pts: [x, y] });
    schedule();
  };
  const move = (e: React.PointerEvent) => {
    const c = cur.current;
    if (!c || !canDraw) return;
    // ★ R087 — 브라우저가 한 프레임에 합친 점까지 전부
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    const list = evs.length ? evs : [e.nativeEvent as PointerEvent];
    const s = ops.current.find((x) => x.id === c.id);
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
  const undo = () => {
    flush(true);
    socket.emit('draw.undo', {});
  };
  const ED = eyeDropper();
  const pick = async () => {
    if (!ED) {
      setTool('pick');
      return;
    }
    try {
      const r = await new ED().open();
      if (r?.sRGBHex) setColor(r.sRGBHex);
    } catch {
      /* Esc — 그대로 */
    }
  };
  // ★ 단축키(출제자 · 입력칸 밖): P · E · B · I · [ ] · Ctrl+Z
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (!canDraw || typing(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'ㅋ')) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const map: Record<string, () => void> = {
      p: () => setTool('pen'),
      ㅔ: () => setTool('pen'),
      e: () => setTool('eraser'),
      ㄷ: () => setTool('eraser'),
      b: () => setTool('fill'),
      ㅠ: () => setTool('fill'),
      i: () => void pick(),
      ㅑ: () => void pick(),
      '[': () => setWidthIdx(widthIdx - 1),
      ']': () => setWidthIdx(widthIdx + 1),
    };
    const f = map[k];
    if (f) {
      e.preventDefault();
      f();
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const solvedIds = new Set(view.solved.map((s) => s.accountId));
  const hintChips = DRAW_HINT_KINDS.filter((k) => view.hints[k]);
  const TOOL_LABEL: Record<Tool, string> = { pen: '펜', eraser: '지우개', fill: '페인트통', pick: '스포이드' };
  const KEY: Record<Tool, string> = { pen: 'P', eraser: 'E', fill: 'B', pick: 'I' };
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
            className={canDraw ? `draw-canvas can tool-${tool}` : 'draw-canvas'}
            style={side > 0 ? { width: side, height: side } : undefined}
            data-draw-canvas
            data-side={side}
            data-strokes={ops.current.length}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={(e) => e.buttons === 0 && up()}
          />
        </div>
        <div className="draw-side">
          {canDraw && (
            <div className="draw-tools" data-draw-tools data-tool={tool}>
              {(['pen', 'eraser', 'fill'] as const).map((t) => (
                <button key={t} type="button" className={tool === t ? 'draw-tool on' : 'draw-tool'} data-draw-tool={t} aria-pressed={tool === t} title={`${TOOL_LABEL[t]} (${KEY[t]})`} onClick={() => setTool(t)}>
                  {TOOL_LABEL[t]}
                </button>
              ))}
              <button
                type="button"
                className={tool === 'pick' ? 'draw-tool on' : 'draw-tool'}
                data-draw-tool="pick"
                data-eyedropper={ED ? 'system' : 'canvas'}
                title={ED ? '스포이드 — 화면 어디든(다른 창 · 모니터도) (I)' : '스포이드 — 그림 안에서 색 집기 (I)'}
                onClick={() => void pick()}
              >
                스포이드
              </button>
              <div className="draw-widths" role="group" aria-label={tool === 'eraser' ? '지우개 굵기' : '펜 굵기'}>
                {DRAW_WIDTH_STEPS.map((w, i) => (
                  <button key={w} type="button" className={widthIdx === i ? 'draw-width on' : 'draw-width'} data-draw-width={w} aria-pressed={widthIdx === i} title={`굵기 ${w} ([ ])`} onClick={() => setWidthIdx(i)}>
                    <span className="draw-width-dot" style={{ width: Math.max(3, Math.round(w * 0.7)), height: Math.max(3, Math.round(w * 0.7)) }} />
                  </button>
                ))}
              </div>
              <div className="draw-palette" role="group" aria-label="색">
                {DRAW_PALETTE.map((c) => (
                  <button key={c} type="button" className={color === c && tool !== 'eraser' ? 'draw-color on' : 'draw-color'} aria-label={c} title={c} data-draw-color={c} onClick={() => setColor(c)}>
                    <span className="draw-swatch" style={{ background: c }} />
                  </button>
                ))}
              </div>
              <div className="draw-custom">
                <label className="draw-color draw-color-custom" title="세부 색">
                  <input type="color" data-draw-custom value={color} onChange={(e) => setColor(e.target.value)} aria-label="세부 색" />
                </label>
                {recent.map((c) => (
                  <button key={c} type="button" className={color === c && tool !== 'eraser' ? 'draw-color on' : 'draw-color'} data-draw-recent={c} title={`최근 ${c}`} onClick={() => setColor(c)}>
                    <span className="draw-swatch" style={{ background: c }} />
                  </button>
                ))}
              </div>
              <button type="button" className="draw-tool" data-draw-undo title="되돌리기 (Ctrl+Z)" onClick={undo}>
                되돌리기
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
