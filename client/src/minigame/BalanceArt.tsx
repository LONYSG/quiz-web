// =============================================================================
// ★★★ 균형의수호자 — 물건 그림 (R050 · D-235)
//
// ★ 찬종: "퀄리티 있고 흥미 있을만한 요소로 사물을 표현하는게 중요할듯 해." · "마블링 · 그릴 자국 · 윤기가 있는 스테이크 / 토핑이 흩어진 피자 조각 /
//   딸기 케이크 / 구멍 있는 도넛" (브리핑)
// ★ 테두리는 **서버가 넓이를 재는 그 다각형**(shared balanceItem)이다 — 그림이 다르면 공정하지 않다. 장식(마블링 · 토핑 · 스프링클)은
//   그 안쪽에만(clipPath) 그린다. 장식은 시드로 정해져 모두에게 같은 그림이다.
// ★ SVG 하나 · 그라데이션 · 질감 · 그림자. 외부 그림 · 라이브러리 없음(번들 0).
// ★ R051 E (설계 소견 — "스테이크는 어두운 통짜 덩어리라 초콜릿 · 통나무로 보이고, 딸기 케이크는 옆 단면이라 위의 딸기가 어색하다"):
//   스테이크 — 밝은 갈색~적갈색 · 한쪽 연노랑 지방 띠 · 그릴 자국 한 방향 4~5줄 굵게 · 윤기 2 · 마블링 뺌 · 후추 · 로즈마리 작게
//   딸기 케이크 — 위에서 본 부채꼴 조각(둥근 모서리 — 외곽은 shared 와 같다) · 크림 윗면 · 테두리 띠(스펀지 · 크림 줄) · 통딸기 2~3
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
        {/* ★ R051 E — 구운 겉면: 밝은 갈색(가운데) → 적갈색(가장자리). 옛 그림은 너무 어두워 초콜릿 · 통나무로 보였다 */}
        <radialGradient id={id('steak')} cx="42%" cy="38%" r="72%">
          <stop offset="0%" stopColor="#c98a52" />
          <stop offset="45%" stopColor="#b0643a" />
          <stop offset="80%" stopColor="#8f4127" />
          <stop offset="100%" stopColor="#6e2c19" />
        </radialGradient>
        <linearGradient id={id('fat')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbf0c6" />
          <stop offset="100%" stopColor="#ecd48f" />
        </linearGradient>
        <radialGradient id={id('cream')} cx="45%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#fffdf8" />
          <stop offset="100%" stopColor="#f8ead5" />
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
            {/* 지방 띠 — 한쪽 가장자리를 따라 연노랑 (안쪽 경계는 살짝 붉게) */}
            <path d={d} fill="none" stroke={`url(#${id('fat')})`} strokeWidth={9} pathLength={100} strokeDasharray={`${deco.fatLen} ${100 - deco.fatLen}`} strokeDashoffset={deco.fatAt} strokeLinecap="round" />
            <path d={d} fill="none" stroke="#d99a6a" strokeWidth={9.6} pathLength={100} strokeDasharray={`${deco.fatLen} ${100 - deco.fatLen}`} strokeDashoffset={deco.fatAt} strokeLinecap="round" opacity={0.35} filter={`url(#${id('blur05')})`} />
            <path d={d} fill="none" stroke={`url(#${id('fat')})`} strokeWidth={8} pathLength={100} strokeDasharray={`${deco.fatLen} ${100 - deco.fatLen}`} strokeDashoffset={deco.fatAt} strokeLinecap="round" />
            {/* 그릴 자국 — 한 방향 4~5줄 · 굵게 · 교차 없음 (가장자리는 갈색으로 번짐) */}
            {deco.grill.map((g, i) => (
              <g key={i}>
                <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#7a3a1c" strokeWidth={6.4} strokeLinecap="round" opacity={0.35} filter={`url(#${id('blur05')})`} />
                <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#3d1a0b" strokeWidth={3.4} strokeLinecap="round" opacity={0.85} />
              </g>
            ))}
            {/* 가장자리 — 살짝 진하게 (탄 느낌은 약하게) */}
            <path d={d} fill="none" stroke="#5a2414" strokeWidth={2.2} opacity={0.4} filter={`url(#${id('blur05')})`} />
            {/* 통후추 (작게) */}
            {deco.pepper.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.42 + (i % 3) * 0.14} fill={i % 2 ? '#22170f' : '#3a2a20'} />
            ))}
            {/* 윤기 하이라이트 1~2 */}
            {!small && (
              <>
                <ellipse cx={deco.steakShine.x} cy={deco.steakShine.y} rx={11} ry={3.2} fill="#fff" opacity={0.34} transform={`rotate(-24 ${deco.steakShine.x} ${deco.steakShine.y})`} filter={`url(#${id('soft')})`} />
                <ellipse cx={deco.steakShine.x + 14} cy={deco.steakShine.y + 14} rx={5} ry={1.6} fill="#fff" opacity={0.26} transform={`rotate(-24 ${deco.steakShine.x + 14} ${deco.steakShine.y + 14})`} filter={`url(#${id('blur05')})`} />
              </>
            )}
          </g>
          {/* 로즈마리 (작게) */}
          {!small &&
            deco.herb.map((h, i) => (
              <g key={i} transform={`translate(${h.x} ${h.y}) rotate(${h.r}) scale(0.72)`}>
                <line x1={0} y1={0} x2={11} y2={0} stroke="#3f6b2a" strokeWidth={0.6} />
                {[1.5, 3.5, 5.5, 7.5, 9.5].map((x) => (
                  <g key={x}>
                    <ellipse cx={x} cy={-1.1} rx={1.3} ry={0.45} fill="#4f8a35" transform={`rotate(-30 ${x} -1.1)`} />
                    <ellipse cx={x + 0.8} cy={1.1} rx={1.3} ry={0.45} fill="#5c9a3e" transform={`rotate(30 ${x + 0.8} 1.1)`} />
                  </g>
                ))}
              </g>
            ))}
          <path d={d} fill="none" stroke="#5a2414" strokeWidth={0.5} fillRule="evenodd" />
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
          {/* ★ R051 E — 위에서 본 조각: 생크림 윗면 + 바깥 테두리 띠(스펀지 · 크림 줄) + 통딸기 2~3 */}
          <path d={d} fill={`url(#${id('cream')})`} />
          <g clipPath={`url(#${id('clip')})`}>
            {/* 테두리 띠 — 바깥부터 스펀지 · 크림 · 스펀지 · 크림(윗면) */}
            <path d={d} fill="none" stroke="#efc57a" strokeWidth={11} />
            <path d={d} fill="none" stroke="#fffaf0" strokeWidth={7.4} />
            <path d={d} fill="none" stroke="#f3d08e" strokeWidth={4.6} />
            <path d={d} fill="none" stroke="#e7b768" strokeWidth={1.4} opacity={0.8} />
            {/* 스펀지 구멍 (띠 위에만 · 작게) */}
            {deco.pores.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.3 + (i % 3) * 0.12} fill="#c99a52" opacity={0.6} />
            ))}
            {/* 윗면 크림 결 — 부드러운 짜기 무늬 */}
            {deco.swirls.map((w, i) => (
              <path key={i} d={w} fill="none" stroke="#efe2cf" strokeWidth={0.9} strokeLinecap="round" opacity={0.9} />
            ))}
          </g>
          {/* 생크림 꽃 짜기 — 둥근 테두리를 따라 */}
          {deco.rosettes.map((r, i) => (
            <g key={i} transform={`translate(${r.x} ${r.y}) rotate(${r.r})`}>
              {!small && <ellipse cx={0.6} cy={1.4} rx={5} ry={4.4} fill="#000" opacity={0.08} filter={`url(#${id('blur05')})`} />}
              <circle r={4.6} fill="#fffefb" stroke="#eadcc6" strokeWidth={0.5} />
              <path d="M-3,0 C-3,-2.6 2.4,-3.2 2.8,-0.4 C3,2 -0.6,2.6 -1.2,0.4 C-1.6,-1 0.6,-1.4 0.8,-0.2" fill="none" stroke="#e6d6bf" strokeWidth={0.7} strokeLinecap="round" />
            </g>
          ))}
          {/* 통딸기 — 꽃 짜기 위에 누운 딸기(끝 쪽을 향해) · 꼭지 */}
          {deco.berries.map((b, i) => (
            <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.r}) scale(1.08)`}>
              {!small && <ellipse cx={1} cy={2.4} rx={6.4} ry={7} fill="#7a1020" opacity={0.18} filter={`url(#${id('blur05')})`} />}
              <path d="M0,-6.4 C5.4,-6.6 7.4,-1.4 5.6,2.6 C4,5.8 1.4,7.6 0,8.2 C-1.4,7.6 -4,5.8 -5.6,2.6 C-7.4,-1.4 -5.4,-6.6 0,-6.4Z" fill={`url(#${id('berry')})`} />
              {[
                [-2.6, -2], [0.2, -2.8], [2.8, -1.6], [-3.4, 1.2], [-0.6, 0.6], [2.4, 1.4], [-1.6, 3.8], [1.4, 4.2], [0, 6.2],
              ].map(([x, y], k) => (
                <ellipse key={k} cx={x} cy={y} rx={0.32} ry={0.55} fill="#ffe69a" />
              ))}
              {!small && <ellipse cx={-2.4} cy={-2.6} rx={1.8} ry={0.9} fill="#fff" opacity={0.5} transform="rotate(-30 -2.4 -2.6)" />}
              {[-60, -25, 10, 45, 80].map((r) => (
                <ellipse key={r} cx={0} cy={-6.6} rx={0.9} ry={2.6} fill="#3f8f3a" transform={`rotate(${r} 0 -5.4)`} />
              ))}
            </g>
          ))}
          <path d={d} fill="none" stroke="#d9a75c" strokeWidth={0.5} />
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
  pores: Pt[];
  berries: { x: number; y: number; r: number }[];
  rosettes: { x: number; y: number; r: number }[];
  swirls: string[];
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
    pores: [],
    berries: [],
    rosettes: [],
    swirls: [],
    icing: '',
    sprinkles: [],
    donutShine: '',
  };

  if (item.kind === 'steak') {
    // ★ R051 E — 마블링(익지 않은 고기 무늬)을 뺐다 · 지방 띠는 한쪽 가장자리에 넓게 · 그릴 자국 4~5줄(한 방향)
    out.fatLen = 26 + rnd() * 10;
    out.fatAt = rnd() * 100;
    const ang = (-32 + rnd() * 16) * (Math.PI / 180);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const gap = 11.5;
    const n = rnd() < 0.5 ? 4 : 5;
    for (let k = 0; k < n; k += 1) {
      const o = (k - (n - 1) / 2) * gap;
      const ox = c.x - dy * o;
      const oy = c.y + dx * o;
      out.grill.push({ x1: ox - dx * 60, y1: oy - dy * 60, x2: ox + dx * 60, y2: oy + dy * 60 });
    }
    out.pepper = scatter(rnd, item.outer, [], 12, 4, 4.5);
    out.herb = [{ x: b.x1 - 16 - rnd() * 8, y: b.y0 + 5 + rnd() * 5, r: -20 + rnd() * 40 }];
    out.steakShine = { x: c.x - 9, y: c.y - 9 };
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
    // ★ R051 E — 위에서 본 조각. 둥근 쪽(끝에서 먼 쪽) 테두리를 따라 생크림 꽃 짜기 5개 · 그 위에 통딸기 2~3(끝 쪽을 향해 누움)
    const tipP = [...item.outer].sort((a, z) => z.y - a.y)[0]!;
    const R = Math.max(...item.outer.map((p) => Math.hypot(p.x - tipP.x, p.y - tipP.y)));
    const rim = shrink(item.outer, 0.84, tipP).map((p) => ({ x: p.x, y: p.y })).filter((p) => Math.hypot(p.x - tipP.x, p.y - tipP.y) > R * 0.8);
    rim.sort((a, z) => Math.atan2(a.y - tipP.y, a.x - tipP.x) - Math.atan2(z.y - tipP.y, z.x - tipP.x));
    const nR = 5;
    for (let q = 0; q < nR && rim.length > 0; q += 1) {
      const p = rim[Math.round(((rim.length - 1) * (q + 0.5)) / nR)]!;
      out.rosettes.push({ x: p.x, y: p.y, r: rnd() * 360 });
    }
    const k = rnd() < 0.5 ? 2 : 3;
    const pick = k === 3 ? [0, 2, 4] : [1, 3];
    out.berries = pick
      .map((q) => out.rosettes[q])
      .filter((p): p is { x: number; y: number; r: number } => Boolean(p))
      .map((p) => ({ x: p.x + (tipP.x - p.x) * 0.1, y: p.y + (tipP.y - p.y) * 0.1, r: (Math.atan2(tipP.y - p.y, tipP.x - p.x) * 180) / Math.PI - 90 + (rnd() - 0.5) * 30 }));
    const band = scatter(rnd, item.outer, [], 120, 0, 1.6);
    const core = shrink(item.outer, 0.86);
    out.pores = band.filter((p) => !inside(core, p.x, p.y));
    const mid = shrink(item.outer, 0.6);
    for (let w = 0; w < 4; w += 1) {
      const p = scatter(rnd, mid, [], 1, 0, 1)[0] ?? c;
      const r0 = 2.2 + rnd() * 1.6;
      out.swirls.push(`M${(p.x - r0).toFixed(2)},${p.y.toFixed(2)} q${r0},${-r0 * 1.2} ${r0 * 2},0 q${-r0 * 0.6},${r0 * 0.8} ${-r0 * 1.2},0`);
    }
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
