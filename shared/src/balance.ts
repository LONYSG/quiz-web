// =============================================================================
// ★★★ 균형의수호자 — 물건 모양 · 넓이 나누기 (R050 · D-235)
//
// ★ 찬종: "닌텐도스위치 '마리오 파티 잼버리'의 게임에서 착안 … 사물의 상단·하단에 수평으로 선이 있고 각각 지점이 표시가 돼
//   (사람마다 랜덤한 위치에 등장) 이 위 아래 지점을 키보드 좌우로 움직일 수 있고 위 아래는 키보드 상하 키로 전환 …
//   퀄리티 있고 흥미 있을만한 요소로 사물을 표현하는게 중요할듯 해."
// ★ 모양은 **시드**로 정한다 — 서버(채점)와 화면(그림)이 같은 함수로 같은 다각형을 만든다. 클라이언트가 보낸 값은 점 두 개뿐이고
//   넓이는 서버가 다시 계산한다(클라이언트 값을 믿지 않는다).
// ★ 좌표: 0~100 정사각형(y 는 아래로). 물건은 대략 x 10~90 · y 16~84. 위 선 y=TOP_Y · 아래 선 y=BOTTOM_Y.
// ★ 넓이: 바깥 다각형 − 구멍(도넛). 자르는 직선의 한쪽 반평면으로 다각형을 자른다(Sutherland–Hodgman — 반평면 하나로 자르는
//   경우는 오목한 다각형이어도 넓이가 정확하다 — 잘린 조각이 0 넓이 다리로 이어질 뿐). 단위 검사: 사각형 · 삼각형 · 구멍 있는 모양.
// =============================================================================

export interface Pt {
  x: number;
  y: number;
}

export type BalanceKind = 'steak' | 'pizza' | 'cake' | 'donut';

export interface BalanceItem {
  kind: BalanceKind;
  /** 그림 이름 */
  label: string;
  seed: number;
  /** 바깥 테두리 (시계 · 반시계 상관없음) */
  outer: Pt[];
  /** 구멍 (도넛) */
  holes: Pt[][];
}

export const BALANCE_TOP_Y = 6;
export const BALANCE_BOTTOM_Y = 94;
export const BALANCE_X_MIN = 2;
export const BALANCE_X_MAX = 98;

/** 시드 난수 (mulberry32) — 서버 · 화면이 같은 값 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIND_LABEL: Record<BalanceKind, string> = { steak: '스테이크', pizza: '피자 조각', cake: '딸기 케이크', donut: '도넛' };

function rotate(pts: Pt[], cx: number, cy: number, ang: number): Pt[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return pts.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c }));
}

/** 다각형을 x 10~90 · y 16~84 안으로 (비율 유지) */
function fitBox(pts: Pt[][], box = { x0: 10, x1: 90, y0: 16, y1: 84 }): Pt[][] {
  const all = pts.flat();
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const k = Math.min((box.x1 - box.x0) / (maxX - minX), (box.y1 - box.y0) / (maxY - minY));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = (box.x0 + box.x1) / 2;
  const ty = (box.y0 + box.y1) / 2;
  return pts.map((poly) => poly.map((p) => ({ x: tx + (p.x - cx) * k, y: ty + (p.y - cy) * k })));
}

function blob(rnd: () => number, cx: number, cy: number, rx: number, ry: number, n: number, wob: number, bumps: { at: number; h: number; w: number }[] = []): Pt[] {
  const harm = [2, 3, 4, 5].map((k) => ({ k, a: (0.012 + rnd() * 0.035) * wob, ph: rnd() * Math.PI * 2 }));
  const out: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    let r = 1;
    for (const h of harm) r += h.a * Math.cos(h.k * t + h.ph);
    for (const b of bumps) {
      let d = Math.abs(t - b.at);
      d = Math.min(d, Math.PI * 2 - d);
      r += b.h * Math.exp(-(d * d) / (2 * b.w * b.w));
    }
    out.push({ x: cx + Math.cos(t) * rx * r, y: cy + Math.sin(t) * ry * r });
  }
  return out;
}

/**
 * ★ 물건 만들기 — 같은 (kind, seed) 면 언제나 같은 모양.
 *   스테이크: 고르지 않은 덩어리 + 한쪽 꼬리(립아이) · 피자 조각: 뾰족한 끝 + 크러스트 호(울퉁불퉁) · 딸기 케이크: 옆에서 본 조각(크림 물결 + 딸기 봉우리)
 *   도넛: 살짝 찌그러진 고리 + **가운데에서 벗어난 구멍**(3판째 꼬기 — 반으로 나누기가 까다롭다)
 */
export function balanceItem(kind: BalanceKind, seed: number): BalanceItem {
  const rnd = seededRandom(seed * 2654435761 + kind.length * 97);
  let outer: Pt[] = [];
  let holes: Pt[][] = [];
  if (kind === 'steak') {
    const tailAt = rnd() * Math.PI * 2;
    outer = blob(rnd, 50, 50, 34, 24, 120, 1.4, [
      { at: tailAt, h: 0.32 + rnd() * 0.12, w: 0.42 },
      { at: tailAt + Math.PI * (0.8 + rnd() * 0.4), h: 0.08, w: 0.6 },
    ]);
    outer = rotate(outer, 50, 50, (rnd() - 0.5) * 0.7);
  } else if (kind === 'pizza') {
    const span = (52 + rnd() * 10) * (Math.PI / 180);
    const tip = { x: 50, y: 88 };
    const R = 74;
    const edgeN = 14;
    const arcN = 36;
    const start = -Math.PI / 2 - span / 2;
    const left: Pt[] = [];
    const right: Pt[] = [];
    const arc: Pt[] = [];
    for (let i = 1; i < edgeN; i += 1) {
      const f = i / edgeN;
      const n = (rnd() - 0.5) * 1.1;
      left.push({ x: tip.x + Math.cos(start) * R * f + n, y: tip.y + Math.sin(start) * R * f });
      right.push({ x: tip.x + Math.cos(start + span) * R * f - n, y: tip.y + Math.sin(start + span) * R * f });
    }
    const crustPh = rnd() * 6;
    for (let i = 0; i <= arcN; i += 1) {
      const a = start + (span * i) / arcN;
      const rr = R + 3.2 * Math.sin(i * 0.9 + crustPh) + (rnd() - 0.5) * 1.6;
      arc.push({ x: tip.x + Math.cos(a) * rr, y: tip.y + Math.sin(a) * rr });
    }
    outer = [tip, ...left, ...arc, ...right.reverse()];
    outer = rotate(outer, 50, 55, (rnd() - 0.5) * 0.6);
  } else if (kind === 'cake') {
    const x0 = 16;
    const x1 = 84;
    const yb = 82;
    const yt = 44 + rnd() * 4;
    const slant = (rnd() - 0.5) * 6;
    const berryX = 30 + rnd() * 40;
    const berryR = 8 + rnd() * 2.5;
    const top: Pt[] = [];
    const N = 60;
    for (let i = 0; i <= N; i += 1) {
      const x = x1 - ((x1 - x0) * i) / N;
      let y = yt + 1.6 * Math.sin(i * 0.75) + slant * (i / N - 0.5);
      const d = Math.abs(x - berryX);
      if (d < berryR) y -= Math.sqrt(berryR * berryR - d * d) * 1.25;
      top.push({ x, y });
    }
    const rightSide: Pt[] = [];
    const leftSide: Pt[] = [];
    for (let i = 1; i < 8; i += 1) {
      const f = i / 8;
      rightSide.push({ x: x1 + (rnd() - 0.5) * 0.9, y: yb - (yb - yt) * f });
      leftSide.push({ x: x0 + (rnd() - 0.5) * 0.9, y: yt + (yb - yt) * f });
    }
    outer = [{ x: x0 + 1.5, y: yb }, { x: x1 - 1.5, y: yb }, ...rightSide, ...top, ...leftSide];
  } else {
    outer = blob(rnd, 50, 50, 36, 33, 120, 0.9);
    const off = 5 + rnd() * 5;
    const ang = rnd() * Math.PI * 2;
    holes = [blob(rnd, 50 + Math.cos(ang) * off, 50 + Math.sin(ang) * off, 12.5, 11.5, 64, 0.8)];
  }
  const fitted = fitBox([outer, ...holes]);
  return { kind, label: KIND_LABEL[kind], seed, outer: fitted[0]!, holes: fitted.slice(1) };
}

/** 판 3개의 물건 — 앞 두 판은 스테이크 · 피자 · 케이크 중 둘(시드로) · 3판째는 도넛(꼬기) */
export function balanceRoundKinds(seed: number): BalanceKind[] {
  const rnd = seededRandom(seed);
  const pool: BalanceKind[] = ['steak', 'pizza', 'cake'];
  const a = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
  const b = pool[Math.floor(rnd() * pool.length)]!;
  return [a, b, 'donut'];
}

export function polygonArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** 직선 A→B 의 왼쪽(외적 ≥ 0) 반평면으로 자른다 */
export function clipHalfPlane(poly: readonly Pt[], a: Pt, b: Pt, keepPositive: boolean): Pt[] {
  const side = (p: Pt) => {
    const v = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    return keepPositive ? v : -v;
  };
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i]!;
    const nxt = poly[(i + 1) % poly.length]!;
    const sc = side(cur);
    const sn = side(nxt);
    if (sc >= 0) out.push(cur);
    if ((sc >= 0) !== (sn >= 0)) {
      const t = sc / (sc - sn);
      out.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t });
    }
  }
  return out;
}

export interface BalanceCut {
  /** 위 선의 점 x */
  top: number;
  /** 아래 선의 점 x */
  bottom: number;
}

export interface BalanceSplit {
  /** 자른 선의 한쪽(위→아래로 볼 때 오른쪽이 아닌 쪽) 넓이 비율 % */
  aPct: number;
  bPct: number;
  /** 작은 쪽 % — 점수 (최대 50) */
  smallPct: number;
}

function itemArea(item: Pick<BalanceItem, 'outer' | 'holes'>): number {
  return polygonArea(item.outer) - item.holes.reduce((s, h) => s + polygonArea(h), 0);
}

/** ★★ 서버 채점 — 두 점을 잇는 직선(선 밖으로 연장)으로 물건을 둘로 */
export function balanceSplit(item: Pick<BalanceItem, 'outer' | 'holes'>, cut: BalanceCut): BalanceSplit {
  const a = { x: cut.top, y: BALANCE_TOP_Y };
  const b = { x: cut.bottom, y: BALANCE_BOTTOM_Y };
  const total = itemArea(item);
  const left = polygonArea(clipHalfPlane(item.outer, a, b, true)) - item.holes.reduce((s, h) => s + polygonArea(clipHalfPlane(h, a, b, true)), 0);
  const aPct = total > 0 ? (left / total) * 100 : 0;
  const bPct = 100 - aPct;
  return { aPct, bPct, smallPct: Math.min(aPct, bPct) };
}

/** 사람마다 다른 시작 점 (서버가 정해 그 사람에게만) — 물건 폭 안에서 무작위 */
export function balanceStart(seed: number, accountId: string, round: number): BalanceCut {
  let h = seed >>> 0;
  for (const ch of `${accountId}:${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  const rnd = seededRandom(h);
  return { top: 14 + rnd() * 72, bottom: 14 + rnd() * 72 };
}

export function clampCutX(x: number): number {
  return Math.min(BALANCE_X_MAX, Math.max(BALANCE_X_MIN, x));
}
