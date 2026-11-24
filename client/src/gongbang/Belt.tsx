// =============================================================================
// ★★★ R117 → R118 — 띠 아이콘(docs/24 5-4 · R116 시안 "가-1 접힌 띠 한 토막" · 랭크 바 안 흰 로마 숫자)
//   ★ 어느 크기나 같은 아이콘 하나 · PC(1배)에서는 20px 아래로 그리지 않는다(R116 메모 — III 가 뭉개진다). 기본 39×17.
//   ★ 로마 숫자 = I · II · III 는 세로 막대 · IV 는 막대 + V(시안 그대로 — R117 은 막대 넷을 그렸다 → R118 고침).
//   ★ 띠 없음(null) = 같은 토막 꼴 · 회색 하나 · 랭크 바 없음.
// =============================================================================

import { BELT_NAMES, beltColorOf, beltDegreeOf, beltLabel, type BeltColor } from '@quiz/shared';

export type { BeltColor };
export const BELT_NAME: Record<BeltColor, string> = BELT_NAMES;

interface Props {
  /** null = 띠 없음(회색 토막 · 랭크 바 없음) */
  color: BeltColor | null;
  /** 단계 0~4 */
  degree?: number;
  width?: number;
}

const TAPE_W = 1.35;
const GAP = 1.04;
const V_W = 2.54;

export default function Belt({ color, degree = 0, width = 39 }: Props) {
  const h = Math.round((width * 17) / 39);
  const n = Math.max(0, Math.min(4, Math.round(degree)));
  const label = color ? `${BELT_NAMES[color]}${n > 0 ? ` ${['', 'I', 'II', 'III', 'IV'][n]}` : ''}` : '띠 없음';
  // 막대 수 · V 하나(IV) — 가운데 22.5 에 맞춘다
  const bars = n === 4 ? 1 : n;
  const hasV = n === 4;
  const total = bars * TAPE_W + (hasV ? GAP + V_W : 0) + Math.max(0, bars - 1) * GAP;
  const start = 22.5 - total / 2;
  const vx = start + bars * (TAPE_W + GAP);
  return (
    <span className="belt" data-belt={color ?? 'none'} data-degree={color ? n : undefined}>
      <svg className="belt-ic" width={width} height={h} viewBox="1 9.5 30 13" role="img" aria-label={label}>
        <rect x="2" y="10.5" width="28" height="11" rx="2.6" fill={color ? `var(--belt-${color})` : 'var(--belt-none)'} />
        <line x1="4" y1="14.2" x2={color ? 16 : 28} y2="14.2" stroke="var(--belt-edge)" strokeOpacity=".22" strokeWidth=".8" />
        <line x1="4" y1="17.8" x2={color ? 16 : 28} y2="17.8" stroke="var(--belt-edge)" strokeOpacity=".22" strokeWidth=".8" />
        {color && <rect x="17" y="11.3" width="11" height="9.4" fill={color === 'black' ? 'var(--belt-bar-red)' : 'var(--belt-bar)'} />}
        {color &&
          Array.from({ length: bars }, (_, i) => (
            <rect key={i} x={(start + i * (TAPE_W + GAP)).toFixed(2)} y="12.90" width={TAPE_W} height="6.2" fill="var(--belt-tape)" />
          ))}
        {color && hasV && (
          <path d={`M${vx.toFixed(2)} 12.90 L${(vx + V_W / 2).toFixed(2)} 19.10 L${(vx + V_W).toFixed(2)} 12.90`} fill="none" stroke="var(--belt-tape)" strokeWidth={TAPE_W} strokeLinejoin="miter" />
        )}
        <rect x="2" y="10.5" width="28" height="11" rx="2.6" fill="none" stroke="var(--belt-edge)" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

/** 띠 칸(0~24 · null = 띠 없음)으로 그리기 */
export function BeltOf({ step, width }: { step: number | null | undefined; width?: number }) {
  if (step === null || step === undefined) return <Belt color={null} width={width} />;
  return <Belt color={beltColorOf(step)} degree={beltDegreeOf(step)} width={width} />;
}

export { beltLabel };
