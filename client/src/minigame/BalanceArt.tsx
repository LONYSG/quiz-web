// =============================================================================
// ★★★ 균형의수호자 — 물건 그림 (R050 · D-235)
//
// ★ 찬종: "퀄리티 있고 흥미 있을만한 요소로 사물을 표현하는게 중요할듯 해." · "마블링 · 그릴 자국 · 윤기가 있는 스테이크 / 토핑이 흩어진 피자 조각 /
//   딸기 케이크 / 구멍 있는 도넛" (브리핑)
// ★ 테두리는 **서버가 넓이를 재는 그 다각형**(shared balanceItem)이다 — 그림이 다르면 공정하지 않다. 장식(마블링 · 토핑 · 스프링클)은
//   그 안쪽에만(clipPath) 그린다. 장식은 시드로 정해져 모두에게 같은 그림이다.
// ★ SVG 하나 · 그라데이션 · 질감 · 그림자. 외부 그림 · 라이브러리 없음(번들 0).
// =============================================================================

import { useId, useMemo } from 'react';
import { seededRandom, type BalanceItem, type Pt } from '@quiz/shared';

export function pathOf(poly: readonly Pt[]): string {
  if (poly.length === 0) return '';
  // ★ 꼭짓점이 촘촘하다(곡선 근사) — 이어 그리면 부드럽다
  return `M${poly.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L')}Z`;
}

function inside(poly: readonly Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function bbox(poly: readonly Pt[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function centroid(poly: readonly Pt[]): Pt {
  const n = poly.length;
  return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
}

/** 다각형 안의 무작위 점들 (가장자리에서 margin 만큼 안쪽 — 모든 꼭짓점과 거리) */
function scatter(rnd: () => number, poly: readonly Pt[], holes: readonly Pt[][], n: number, margin: number, minGap: number): Pt[] {
  const b = bbox(poly);
  const out: Pt[] = [];
  for (let tries = 0; tries < n * 60 && out.length < n; tries += 1) {
    const x = b.x0 + rnd() * (b.x1 - b.x0);
    const y = b.y0 + rnd() * (b.y1 - b.y0);
    if (!inside(poly, x, y)) continue;
    if (holes.some((h) => inside(h, x, y))) continue;
    const near = (pts: readonly Pt[]) => pts.some((p) => Math.hypot(p.x - x, p.y - y) < margin);
    if (near(poly) || holes.some(near)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < minGap)) continue;
    out.push({ x, y });
  }
  return out;
}

function shrink(poly: readonly Pt[], k: number, about?: Pt): Pt[] {
  const c = about ?? centroid(poly);
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

interface Props {
  item: BalanceItem;
  /** 그림자 · 광택을 줄인 작은 그림(결과 썸네일) */
  small?: boolean;
}

/** viewBox 0 0 100 100 안의 <g> — 부르는 쪽이 <svg> 와 선 · 점을 그린다 */
export default function BalanceArt({ item, small = false }: Props) {
  const uid = useId().replace(/:/g, '');
  const id = (s: string) => `${s}-${uid}`;
  const d = useMemo(() => pathOf(item.outer) + item.holes.map(pathOf).join(''), [item]);
  const deco = useMemo(() => decorate(item), [item]);
  return (
    <g className={`balance-art kind-${item.kind}`}>
      <defs>
        <clipPath id={id('clip')}>
          <path d={d} clipRule="evenodd" />
        </clipPath>
        <filter id={id('soft')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id={id('blur05')} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
        <radialGradient id={id('steak')} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#9a3c27" />
          <stop offset="55%" stopColor="#7a2c1b" />
          <stop offset="100%" stopColor="#4c170c" />
        </radialGradient>
        <linearGradient id={id('crust')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9b56a" />
          <stop offset="100%" stopColor="#c47a34" />
        </linearGradient>
        <radialGradient id={id('cheese')} cx="50%" cy="60%" r="70%">
          <stop offset="0%" stopColor="#fde58a" />
          <stop offset="70%" stopColor="#f6c54d" />
          <stop offset="100%" stopColor="#e9a83a" />
        </radialGradient>
        <radialGradient id={id('pep')} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#d4493a" />
          <stop offset="100%" stopColor="#8f2219" />
        </radialGradient>
        <linearGradient id={id('sponge')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe7b4" />
          <stop offset="100%" stopColor="#f0cf86" />
        </linearGradient>
        <radialGradient id={id('berry')} cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="60%" stopColor="#e2283f" />
          <stop offset="100%" stopColor="#a8122a" />
        </radialGradient>
        <radialGradient id={id('dough')} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#e8ad6c" />
          <stop offset="100%" stopColor="#b8733a" />
        </radialGradient>
        <linearGradient id={id('icing')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffb3cf" />
          <stop offset="100%" stopColor="#ef6f9f" />
        </linearGradient>
      </defs>

      {/* 그림자 */}
      {!small && <path d={d} fill="#000" opacity={0.22} transform="translate(1.4 2.4)" filter={`url(#${id('soft')})`} fillRule="evenodd" />}

      {item.kind === 'steak' && (
        <>
          <path d={d} fill={`url(#${id('steak')})`} fillRule="evenodd" />
          <g clipPath={`url(#${id('clip')})`}>
            {/* 지방 테두리 — 테두리의 한 구간 */}
            <path d={d} fill="none" stroke="#efd2a4" strokeWidth={4.4} pathLength={100} strokeDasharray={`${deco.fatLen} ${100 - deco.fatLen}`} strokeDashoffset={deco.fatAt} opacity={0.92} />
            <path d={d} fill="none" stroke="#c99a62" strokeWidth={1.4} pathLength={100} strokeDasharray={`${deco.fatLen} ${100 - deco.fatLen}`} strokeDashoffset={deco.fatAt} opacity={0.6} />
            {/* 마블링 */}
            {deco.marble.map((m, i) => (
              <path key={i} d={m} fill="none" stroke="#f6dccd" strokeWidth={0.45 + (i % 3) * 0.18} strokeLinecap="round" opacity={0.42} />
            ))}
            {/* 그릴 자국 (탄 자국 + 가장자리 갈색) */}
            {deco.grill.map((g, i) => (
              <g key={i}>
                <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#8a4a22" strokeWidth={4.6} strokeLinecap="round" opacity={0.35} />
                <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#2a0d05" strokeWidth={2.4} strokeLinecap="round" opacity={0.78} />
              </g>
            ))}
            {/* 가장자리 그을림 */}
            <path d={d} fill="none" stroke="#2c0f06" strokeWidth={2.6} opacity={0.55} filter={`url(#${id('blur05')})`} />
            {/* 통후추 */}
            {deco.pepper.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.55 + (i % 3) * 0.2} fill={i % 2 ? '#1c1410' : '#3a2a20'} />
            ))}
            {/* 윤기 */}
            {!small && <ellipse cx={deco.steakShine.x} cy={deco.steakShine.y} rx={14} ry={5} fill="#fff" opacity={0.16} transform={`rotate(-22 ${deco.steakShine.x} ${deco.steakShine.y})`} filter={`url(#${id('soft')})`} />}
          </g>
          {/* 로즈마리 */}
          {!small &&
            deco.herb.map((h, i) => (
              <g key={i} transform={`translate(${h.x} ${h.y}) rotate(${h.r})`}>
                <line x1={0} y1={0} x2={11} y2={0} stroke="#3f6b2a" strokeWidth={0.6} />
                {[1.5, 3.5, 5.5, 7.5, 9.5].map((x) => (
                  <g key={x}>
                    <ellipse cx={x} cy={-1.1} rx={1.3} ry={0.45} fill="#4f8a35" transform={`rotate(-30 ${x} -1.1)`} />
                    <ellipse cx={x + 0.8} cy={1.1} rx={1.3} ry={0.45} fill="#5c9a3e" transform={`rotate(30 ${x + 0.8} 1.1)`} />
                  </g>
                ))}
              </g>
            ))}
          <path d={d} fill="none" stroke="#3a1208" strokeWidth={0.5} fillRule="evenodd" />
        </>
      )}

      {item.kind === 'pizza' && (
        <>
          <path d={d} fill={`url(#${id('crust')})`} />
          <g clipPath={`url(#${id('clip')})`}>
            {/* 치즈 — 끝(꼭짓점)을 기준으로 줄인 같은 모양 → 크러스트가 바깥 호에 남는다 */}
            <path d={pathOf(shrink(item.outer, 0.84, deco.tip))} fill={`url(#${id('cheese')})`} />
            {/* 토마토 소스가 비치는 곳 */}
            {deco.sauce.map((p, i) => (
              <ellipse key={i} cx={p.x} cy={p.y} rx={2.2 + (i % 3)} ry={1.3 + (i % 2)} fill="#d9542c" opacity={0.45} />
            ))}
            {/* 치즈 기포 */}
            {deco.bubble.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.8 + (i % 3) * 0.45} fill="#fff4c4" opacity={0.65} />
            ))}
            {/* 페퍼로니 */}
            {deco.pep.map((p, i) => (
              <g key={i}>
                <circle cx={p.x + 0.4} cy={p.y + 0.6} r={4.3} fill="#000" opacity={0.15} />
                <circle cx={p.x} cy={p.y} r={4.1} fill={`url(#${id('pep')})`} />
                <circle cx={p.x} cy={p.y} r={4.1} fill="none" stroke="#6e170f" strokeWidth={0.45} />
                <circle cx={p.x - 1.2} cy={p.y - 0.8} r={0.6} fill="#f0a08a" opacity={0.6} />
                <circle cx={p.x + 1.1} cy={p.y + 1} r={0.45} fill="#5a0f09" opacity={0.6} />
              </g>
            ))}
            {/* 바질 */}
            {deco.basil.map((p, i) => (
              <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${(i * 67) % 360})`}>
                <ellipse cx={0} cy={0} rx={2.6} ry={1.3} fill="#3e8a3a" />
                <line x1={-2.2} y1={0} x2={2.2} y2={0} stroke="#2d6a2a" strokeWidth={0.3} />
              </g>
            ))}
            {/* 크러스트 그을린 점 */}
            {deco.crustSpots.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.5 + (i % 2) * 0.3} fill="#8a4a1c" opacity={0.6} />
            ))}
            {!small && <path d={pathOf(shrink(item.outer, 0.93, deco.tip))} fill="none" stroke="#fff6d8" strokeWidth={0.6} opacity={0.35} />}
          </g>
          <path d={d} fill="none" stroke="#9a5a22" strokeWidth={0.5} />
        </>
      )}

      {item.kind === 'cake' && (
        <>
          <path d={d} fill={`url(#${id('sponge')})`} />
          <g clipPath={`url(#${id('clip')})`}>
            {/* 크림 층 · 딸기 단면 */}
            {deco.layers.map((y, i) => (
              <rect key={i} x={0} y={y} width={100} height={3.6} fill="#fffaf2" />
            ))}
            {deco.slices.map((s, i) => (
              <g key={i}>
                <ellipse cx={s.x} cy={s.y} rx={3.4} ry={2.1} fill={`url(#${id('berry')})`} />
                <ellipse cx={s.x} cy={s.y} rx={1.7} ry={0.9} fill="#ffd0d8" opacity={0.75} />
              </g>
            ))}
            {/* 스펀지 구멍 질감 */}
            {deco.pores.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.35 + (i % 3) * 0.15} fill="#d9b06a" opacity={0.55} />
            ))}
            {/* 맨 위 생크림 */}
            <rect x={0} y={0} width={100} height={deco.creamTop} fill="#fffdf8" />
            <rect x={0} y={deco.creamTop - 1.6} width={100} height={1.6} fill="#f3e6d6" opacity={0.8} />
            {/* 딸기 (위 봉우리) */}
            <path d={deco.berryPath} fill={`url(#${id('berry')})`} />
            {deco.seeds.map((p, i) => (
              <ellipse key={i} cx={p.x} cy={p.y} rx={0.32} ry={0.5} fill="#ffe69a" />
            ))}
            {!small && <ellipse cx={deco.berryHi.x} cy={deco.berryHi.y} rx={2.2} ry={1.1} fill="#fff" opacity={0.45} />}
            {/* 딸기를 받치는 생크림 한 덩이 (딸기 밑의 평평한 선을 덮는다) */}
            <rect x={deco.dollop.x - deco.dollop.r * 1.3} y={deco.dollop.y} width={deco.dollop.r * 2.6} height={Math.max(0, deco.creamTop - deco.dollop.y)} fill="#fffdf8" />
            <ellipse cx={deco.dollop.x} cy={deco.dollop.y} rx={deco.dollop.r} ry={deco.dollop.r * 0.24} fill="#fffdf8" />
            <ellipse cx={deco.dollop.x - deco.dollop.r * 0.2} cy={deco.dollop.y - deco.dollop.r * 0.08} rx={deco.dollop.r * 0.45} ry={deco.dollop.r * 0.12} fill="#ffffff" />
          </g>
          {/* 꼭지 */}
          <g transform={`translate(${deco.leaf.x} ${deco.leaf.y})`}>
            {[-40, -10, 20, 50].map((r) => (
              <ellipse key={r} cx={0} cy={-1.2} rx={1} ry={2.4} fill="#3f8f3a" transform={`rotate(${r})`} />
            ))}
          </g>
          <path d={d} fill="none" stroke="#e2bc7b" strokeWidth={0.5} />
        </>
      )}

      {item.kind === 'donut' && (
        <>
          <path d={d} fill={`url(#${id('dough')})`} fillRule="evenodd" />
          <g clipPath={`url(#${id('clip')})`}>
            {/* 아이싱 — 바깥은 물결 · 구멍 둘레는 넓게 */}
            <path d={deco.icing} fill={`url(#${id('icing')})`} fillRule="evenodd" />
            {deco.sprinkles.map((s, i) => (
              <rect key={i} x={s.x - 1.4} y={s.y - 0.38} width={2.8} height={0.76} rx={0.38} fill={s.c} transform={`rotate(${s.r} ${s.x} ${s.y})`} />
            ))}
            {!small && <path d={deco.donutShine} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" opacity={0.35} filter={`url(#${id('blur05')})`} />}
            {/* 구멍 둘레 그늘 */}
            {item.holes.map((h, i) => (
              <path key={i} d={pathOf(h)} fill="none" stroke="#7a4518" strokeWidth={2.2} opacity={0.4} filter={`url(#${id('blur05')})`} />
            ))}
          </g>
          <path d={d} fill="none" stroke="#8a5222" strokeWidth={0.5} fillRule="evenodd" />
        </>
      )}
    </g>
  );
}

interface Deco {
  fatLen: number;
  fatAt: number;
  marble: string[];
  grill: { x1: number; y1: number; x2: number; y2: number }[];
  pepper: Pt[];
  herb: { x: number; y: number; r: number }[];
  steakShine: Pt;
  tip: Pt;
  sauce: Pt[];
  bubble: Pt[];
  pep: Pt[];
  basil: Pt[];
  crustSpots: Pt[];
  layers: number[];
  slices: Pt[];
  pores: Pt[];
  creamTop: number;
  berryPath: string;
  seeds: Pt[];
  berryHi: Pt;
  leaf: Pt;
  dollop: { x: number; y: number; r: number };
  icing: string;
  sprinkles: { x: number; y: number; r: number; c: string }[];
  donutShine: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 장식 (시드 — 모두에게 같은 그림)
// ─────────────────────────────────────────────────────────────────────────────
function decorate(item: BalanceItem) {
  const rnd = seededRandom(item.seed * 7 + 13);
  const b = bbox(item.outer);
  const c = centroid(item.outer);
  const out: Deco = {
    fatLen: 0,
    fatAt: 0,
    marble: [],
    grill: [],
    pepper: [],
    herb: [],
    steakShine: c,
    tip: c,
    sauce: [],
    bubble: [],
    pep: [],
    basil: [],
    crustSpots: [],
    layers: [],
    slices: [],
    pores: [],
    creamTop: 0,
    berryPath: '',
    seeds: [],
    berryHi: c,
    leaf: c,
    dollop: { x: c.x, y: c.y, r: 0 },
    icing: '',
    sprinkles: [],
    donutShine: '',
  };

  if (item.kind === 'steak') {
    out.fatLen = 22 + rnd() * 14;
    out.fatAt = rnd() * 100;
    for (let i = 0; i < 14; i += 1) {
      const x = b.x0 + rnd() * (b.x1 - b.x0);
      const y = b.y0 + rnd() * (b.y1 - b.y0);
      const ang = rnd() * Math.PI;
      const len = 6 + rnd() * 16;
      let path = `M${x.toFixed(2)},${y.toFixed(2)}`;
      let px = x;
      let py = y;
      for (let k = 0; k < 4; k += 1) {
        const a = ang + (rnd() - 0.5) * 1.4;
        const nx = px + Math.cos(a) * (len / 4);
        const ny = py + Math.sin(a) * (len / 4);
        path += `Q${(px + nx) / 2 + (rnd() - 0.5) * 3},${(py + ny) / 2 + (rnd() - 0.5) * 3} ${nx.toFixed(2)},${ny.toFixed(2)}`;
        px = nx;
        py = ny;
      }
      out.marble.push(path);
    }
    const ang = (-35 + rnd() * 20) * (Math.PI / 180);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const gap = 12;
    for (let k = -2; k <= 2; k += 1) {
      const ox = c.x - dy * gap * k;
      const oy = c.y + dx * gap * k;
      out.grill.push({ x1: ox - dx * 60, y1: oy - dy * 60, x2: ox + dx * 60, y2: oy + dy * 60 });
    }
    out.pepper = scatter(rnd, item.outer, [], 16, 3, 3.5);
    out.herb = [{ x: b.x1 - 18 - rnd() * 8, y: b.y0 + 4 + rnd() * 6, r: -20 + rnd() * 40 }];
    out.steakShine = { x: c.x - 8, y: c.y - 8 };
  } else if (item.kind === 'pizza') {
    // 끝(꼭짓점) = 가장 아래쪽에 가까운 첫 점 (balanceItem 이 끝을 첫 점으로 만든다)
    out.tip = item.outer[0]!;
    const cheese = shrink(item.outer, 0.84, out.tip);
    out.pep = scatter(rnd, cheese, [], 6, 5, 10.5);
    out.sauce = scatter(rnd, cheese, [], 7, 1.5, 7);
    out.bubble = scatter(rnd, cheese, [], 18, 1.5, 3);
    out.basil = scatter(rnd, cheese, [], 3, 4, 9);
    const crustBand = item.outer.filter((p) => !inside(cheese, p.x, p.y));
    out.crustSpots = crustBand.filter((_, i) => i % 4 === 0).map((p) => ({ x: p.x + (out.tip.x - p.x) * 0.04, y: p.y + (out.tip.y - p.y) * 0.04 }));
  } else if (item.kind === 'cake') {
    // 맨 위 크림 = 다각형 윗부분(딸기 봉우리 밑까지) · 층은 그 아래 두 줄
    const top = item.outer.filter((p) => p.y < b.y0 + (b.y1 - b.y0) * 0.55);
    const baseTop = top.length ? [...top].sort((a, z) => z.y - a.y)[Math.floor(top.length * 0.15)]!.y : b.y0 + 10;
    out.creamTop = baseTop + 5;
    const h = b.y1 - out.creamTop;
    out.layers = [out.creamTop + h * 0.33, out.creamTop + h * 0.66];
    for (const ly of [out.creamTop + h * 0.33]) {
      for (let x = b.x0 + 5 + rnd() * 4; x < b.x1 - 4; x += 10 + rnd() * 3) out.slices.push({ x, y: ly + 1.8 });
    }
    out.pores = scatter(rnd, item.outer, [], 40, 1.2, 2.2).filter((p) => p.y > out.creamTop + 2 && !out.layers.some((ly) => Math.abs(p.y - ly - 1.8) < 2.6));
    // 딸기 봉우리 = 가장 위 점 근처
    const peak = [...item.outer].sort((a, z) => a.y - z.y)[0]!;
    const r = Math.max(6, (out.creamTop - peak.y) * 0.95);
    const bx = peak.x;
    const by = peak.y + r * 0.95;
    out.berryPath = `M${bx - r * 0.95},${by} C${bx - r},${by - r * 0.9} ${bx - r * 0.4},${peak.y - 0.6} ${bx},${peak.y - 0.4} C${bx + r * 0.4},${peak.y - 0.6} ${bx + r},${by - r * 0.9} ${bx + r * 0.95},${by} Q${bx},${by + r * 0.35} ${bx - r * 0.95},${by}Z`;
    for (let i = 0; i < 12; i += 1) out.seeds.push({ x: bx + (rnd() - 0.5) * r * 1.4, y: by - rnd() * r * 0.9 });
    out.berryHi = { x: bx - r * 0.35, y: by - r * 0.55 };
    out.leaf = { x: bx, y: peak.y + 0.4 };
    out.dollop = { x: bx, y: out.creamTop - r * 0.26, r: r * 0.95 };
  } else {
    // 도넛 — 아이싱은 바깥보다 조금 작은 물결 고리 · 구멍 둘레는 넓게
    const hole = item.holes[0] ?? [];
    const hc = centroid(hole);
    const icingOuter = item.outer.map((p, i) => {
      const k = 0.86 + 0.05 * Math.sin(i * 0.55 + rnd() * 0.3) + (i % 9 === 0 ? 0.05 : 0);
      return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
    });
    const icingHole = hole.map((p) => ({ x: hc.x + (p.x - hc.x) * 1.28, y: hc.y + (p.y - hc.y) * 1.28 }));
    out.icing = pathOf(icingOuter) + pathOf(icingHole);
    const colors = ['#ffffff', '#ffd54a', '#5bc0ff', '#7ee08a', '#b388ff', '#ff8a65'];
    out.sprinkles = scatter(rnd, icingOuter, [icingHole], 46, 1.6, 3.1).map((p, i) => ({ x: p.x, y: p.y, r: rnd() * 180, c: colors[i % colors.length]! }));
    const rr = (b.x1 - b.x0) * 0.36;
    out.donutShine = `M${c.x - rr * 0.9},${c.y - rr * 0.35} Q${c.x - rr * 0.6},${c.y - rr * 0.95} ${c.x + rr * 0.05},${c.y - rr * 0.98}`;
  }
  return out;
}
