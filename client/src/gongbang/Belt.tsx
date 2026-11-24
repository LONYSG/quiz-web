// =============================================================================
// ★★★ R117 — 띠 아이콘 부품(docs/24 5-4 · R116 시안 "가-1 접힌 띠 한 토막" · 랭크 바 안 흰 로마 숫자 줄)
//   ★ 아직 화면에 붙이지 않는다(띠는 솔로가 생겨야 뜻이 있다 — R117 지시서). 솔로 · 띠 라운드가 그대로 가져다 쓴다.
//   ★ PC(1배)에서는 20px 아래로 그리지 않는다(R116 메모 — III 가 뭉개진다). 기본 39×17.
// =============================================================================

export type BeltColor = 'white' | 'blue' | 'purple' | 'brown' | 'black';
export const BELT_NAME: Record<BeltColor, string> = { white: '화이트벨트', blue: '블루벨트', purple: '퍼플벨트', brown: '브라운벨트', black: '블랙벨트' };
const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

interface Props {
  /** null = 띠 없음(회색 토막 · 랭크 바 없음) */
  color: BeltColor | null;
  /** 단계 0~4 */
  degree?: number;
  width?: number;
}

export default function Belt({ color, degree = 0, width = 39 }: Props) {
  const h = Math.round((width * 17) / 39);
  const label = color ? `${BELT_NAME[color]}${degree > 0 ? ` ${ROMAN[degree]}` : ''}` : '띠 없음';
  const n = Math.max(0, Math.min(4, Math.round(degree)));
  const tapeW = 1.35;
  const gap = 1.04;
  const total = n * tapeW + Math.max(0, n - 1) * gap;
  const start = 22.5 - total / 2;
  return (
    <span className="belt">
      <svg className="belt-ic" width={width} height={h} viewBox="1 9.5 30 13" role="img" aria-label={label}>
        <rect x="2" y="10.5" width="28" height="11" rx="2.6" fill={color ? `var(--belt-${color})` : 'var(--belt-none)'} />
        <line x1="4" y1="14.2" x2={color ? 16 : 28} y2="14.2" stroke="var(--belt-edge)" strokeOpacity=".22" strokeWidth=".8" />
        <line x1="4" y1="17.8" x2={color ? 16 : 28} y2="17.8" stroke="var(--belt-edge)" strokeOpacity=".22" strokeWidth=".8" />
        {color && <rect x="17" y="11.3" width="11" height="9.4" fill={color === 'black' ? 'var(--belt-bar-red)' : 'var(--belt-bar)'} />}
        {color &&
          Array.from({ length: n }, (_, i) => (
            <rect key={i} x={(start + i * (tapeW + gap)).toFixed(2)} y="12.90" width={tapeW} height="6.2" fill="var(--belt-tape)" />
          ))}
        <rect x="2" y="10.5" width="28" height="11" rx="2.6" fill="none" stroke="var(--belt-edge)" strokeWidth="1.6" />
      </svg>
    </span>
  );
}
