// =============================================================================
// ★★★ 균형의 수호자 — 물건 모양 · 넓이 나누기 (R050 · D-235)
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

/** ★ R066 (D-286 · 찬종 #51 "이미지나 상황 더 추가해줘. 이거 재밌음") — 물건 4 → 12 (식빵 · 치즈 · 수박 · 계란 프라이 · 쿠키 · 샌드위치 · 오므라이스 · 하트 초콜릿) */
export type BalanceKind = 'steak' | 'pizza' | 'cake' | 'donut' | 'bread' | 'cheese' | 'watermelon' | 'egg' | 'cookie' | 'sandwich' | 'omurice' | 'heart';
/** 모든 물건(그림 확인 · 검사) */
export const BALANCE_KINDS: readonly BalanceKind[] = ['steak', 'pizza', 'cake', 'donut', 'bread', 'cheese', 'watermelon', 'egg', 'cookie', 'sandwich', 'omurice', 'heart'];
/** ★ R066 — 장면(물건 아래 배경 · 넓이와 무관) — 시드로 정한다(plain = 지금 그대로 · 나무 도마 · 소풍 천) */
export type BalanceScene = 'plain' | 'board' | 'picnic';
export function balanceScene(seed: number): BalanceScene {
  return (['plain', 'board', 'picnic'] as const)[seed % 3]!;
}

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

const KIND_LABEL: Record<BalanceKind, string> = {
  steak: '스테이크',
  pizza: '피자 조각',
  cake: '딸기 케이크',
  donut: '도넛',
  bread: '식빵',
  cheese: '구멍 치즈',
  watermelon: '수박 조각',
  egg: '계란 프라이',
  cookie: '초코칩 쿠키',
  sandwich: '샌드위치',
  omurice: '오므라이스',
  heart: '하트 초콜릿',
};

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
/** 모서리 깎기 (닫힌 다각형 · 한 번에 점 2배) — 둥근 모서리 */
function chaikin(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    out.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 }, { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
  }
  return out;
}

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
    // ★ R051 E — 옆 단면 → **위에서 본 조각**(부채꼴 · 둥근 모서리). 피자보다 넓고 짧은 부채꼴(70~82°)
    //   (설계 소견: "딸기 케이크는 옆 단면이라 위의 딸기가 어색하다"). 둥근 모서리 = 모서리 깎기(Chaikin) 3번 — 넓이 계산도 이 외곽 그대로
    const span = (70 + rnd() * 12) * (Math.PI / 180);
    const tip = { x: 50, y: 86 };
    const R = 66 + rnd() * 4;
    const start = -Math.PI / 2 - span / 2;
    const raw: Pt[] = [tip];
    const sideN = 10;
    for (let i = 1; i < sideN; i += 1) raw.push({ x: tip.x + Math.cos(start) * R * (i / sideN), y: tip.y + Math.sin(start) * R * (i / sideN) });
    const arcN = 40;
    for (let i = 0; i <= arcN; i += 1) {
      const a = start + (span * i) / arcN;
      raw.push({ x: tip.x + Math.cos(a) * R, y: tip.y + Math.sin(a) * R });
    }
    for (let i = sideN - 1; i >= 1; i -= 1) raw.push({ x: tip.x + Math.cos(start + span) * R * (i / sideN), y: tip.y + Math.sin(start + span) * R * (i / sideN) });
    outer = rotate(chaikin(chaikin(chaikin(raw))), 50, 55, (rnd() - 0.5) * 0.7);
  } else if (kind === 'donut') {
    outer = blob(rnd, 50, 50, 36, 33, 120, 0.9);
    const off = 5 + rnd() * 5;
    const ang = rnd() * Math.PI * 2;
    holes = [blob(rnd, 50 + Math.cos(ang) * off, 50 + Math.sin(ang) * off, 12.5, 11.5, 64, 0.8)];
  } else if (kind === 'bread') {
    // 식빵 — 아래는 네모(둥근 모서리) · 위는 버섯처럼 부푼 두 봉우리
    const w = 30 + rnd() * 4;
    const raw: Pt[] = [];
    const lobe = 0.9 + rnd() * 0.25;
    for (let i = 0; i <= 40; i += 1) {
      const t = Math.PI + (Math.PI * i) / 40; // 왼쪽 → 위 → 오른쪽
      const bump = 1 + 0.07 * Math.cos(2 * (t - Math.PI) * 2) * lobe;
      raw.push({ x: 50 + Math.cos(t) * (w + 6) * bump, y: 40 + Math.sin(t) * 22 * bump });
    }
    raw.push({ x: 50 + w, y: 78 }, { x: 50 - w, y: 78 });
    outer = rotate(chaikin(chaikin(raw)), 50, 55, (rnd() - 0.5) * 0.5);
  } else if (kind === 'cheese') {
    // 구멍 치즈 — 쐐기(삼각) · 구멍 2~3개(넓이에서 빠진다)
    const raw: Pt[] = [{ x: 14, y: 76 }, { x: 86, y: 76 }, { x: 86, y: 58 }, { x: 22 + rnd() * 8, y: 24 + rnd() * 6 }];
    const ang = (rnd() - 0.5) * 0.6;
    outer = rotate(chaikin(chaikin(raw)), 50, 55, ang);
    const n = 2 + Math.floor(rnd() * 2);
    const spots = [
      { x: 58, y: 64 },
      { x: 72, y: 66 },
      { x: 44, y: 56 },
    ];
    holes = spots.slice(0, n).map((p) => rotate(blob(rnd, p.x + (rnd() - 0.5) * 3, p.y + (rnd() - 0.5) * 3, 4 + rnd() * 2.5, 3.6 + rnd() * 2, 40, 0.6), 50, 55, ang));
      } else if (kind === 'watermelon') {
    // 수박 조각 — 반달(위가 평평한 반원을 뒤집은 꼴) · 테두리 껍질은 그림만
    const R = 40 + rnd() * 3;
    const raw: Pt[] = [];
    for (let i = 0; i <= 60; i += 1) {
      const t = (Math.PI * i) / 60;
      raw.push({ x: 50 + Math.cos(t) * R, y: 34 + Math.sin(t) * R * (0.9 + rnd() * 0.02) });
    }
    outer = rotate(raw, 50, 50, (rnd() - 0.5) * 0.7);
  } else if (kind === 'egg') {
    // 계란 프라이 — 흰자는 크게 출렁이는 덩어리
    outer = blob(rnd, 50, 50, 36, 30, 140, 3.2, [
      { at: rnd() * Math.PI * 2, h: 0.18, w: 0.5 },
      { at: rnd() * Math.PI * 2, h: 0.14, w: 0.4 },
    ]);
  } else if (kind === 'cookie') {
    // 쿠키 — 울퉁불퉁한 원 · 한 입 베어 먹은 자국
    const biteAt = rnd() * Math.PI * 2;
    outer = blob(rnd, 50, 50, 34, 33, 140, 1.6, [{ at: biteAt, h: -0.22, w: 0.22 }]);
  } else if (kind === 'sandwich') {
    // 샌드위치 — 대각선으로 자른 삼각형(둥근 모서리)
    const raw: Pt[] = [{ x: 16, y: 80 }, { x: 84, y: 80 }, { x: 18 + rnd() * 6, y: 18 + rnd() * 4 }];
    outer = rotate(chaikin(chaikin(chaikin(raw))), 50, 55, (rnd() - 0.5) * 0.8);
  } else if (kind === 'omurice') {
    // 오므라이스 — 럭비공 꼴(양 끝이 조금 뾰족)
    const raw: Pt[] = [];
    for (let i = 0; i < 120; i += 1) {
      const t = (i / 120) * Math.PI * 2;
      const pinch = 1 - 0.1 * Math.cos(2 * t) ** 8;
      raw.push({ x: 50 + Math.cos(t) * 38 * pinch, y: 50 + Math.sin(t) * 22 * (1 + 0.05 * Math.sin(t * 3 + rnd() * 6)) });
    }
    outer = rotate(raw, 50, 50, (rnd() - 0.5) * 0.6);
  } else {
    // 하트 초콜릿 — 하트 곡선(조금 기울어짐 · 좌우가 살짝 다르다)
    const skew = (rnd() - 0.5) * 0.18;
    const raw: Pt[] = [];
    for (let i = 0; i < 140; i += 1) {
      const t = (i / 140) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      raw.push({ x: 50 + x * 2.2 * (1 + (x > 0 ? skew : -skew)), y: 50 + y * 2.2 });
    }
    outer = rotate(raw, 50, 50, (rnd() - 0.5) * 0.5);
  }
  const fitted = fitBox([outer, ...holes]);
  return { kind, label: KIND_LABEL[kind], seed, outer: fitted[0]!, holes: fitted.slice(1) };
}

/** 판 3개의 물건 — 앞 두 판은 구멍 없는 것 중 둘(시드로 · ★ R066 11종) · 3판째는 구멍 있는 것(도넛 · 구멍 치즈 — 꼬기) */
export function balanceRoundKinds(seed: number): BalanceKind[] {
  const rnd = seededRandom(seed);
  const pool: BalanceKind[] = ['steak', 'pizza', 'cake', 'bread', 'watermelon', 'egg', 'cookie', 'sandwich', 'omurice', 'heart'];
  const a = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
  const b = pool[Math.floor(rnd() * pool.length)]!;
  return [a, b, rnd() < 0.5 ? 'donut' : 'cheese'];
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
