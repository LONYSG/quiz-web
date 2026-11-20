// =============================================================================
// ★★ R110 — 공식 로고 부품 하나(찬종 2026-11-20 "공식 로고로 하고 웹 등 모든 곳에서 로고를 쓸 일이 있다면 이걸 써 이제.")
//   정본 = docs/design/logo/quizdojang-logo.svg — 그 파일을 그대로 읽어 쓴다(좌표 · 색을 여기서 새로 짓지 않는다).
//   ★ 작은 크기(32px 이하)에서는 흰 테두리가 뭉개져 테두리 굵기만 키운다(svg 주석대로 — 그 밖은 그대로).
//   파비콘 · 앱 아이콘 png 는 scripts/logo-icons.mjs 가 같은 파일에서 뽑는다.
// =============================================================================

import LOGO_SVG from '../../docs/design/logo/quizdojang-logo.svg?raw';

/** 작은 크기용 — 안쪽 흰 테두리 12 → 20 (그 밖은 같다) */
export const LOGO_SVG_SMALL = LOGO_SVG.replace('stroke-width="12"', 'stroke-width="20"');
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const URL_FULL = dataUrl(LOGO_SVG);
const URL_SMALL = dataUrl(LOGO_SVG_SMALL);

export default function BrandLogo({ size = 64, className = 'brand-mark' }: { size?: number; className?: string }) {
  return (
    <img
      className={className}
      src={size <= 32 ? URL_SMALL : URL_FULL}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-brand-logo
    />
  );
}
