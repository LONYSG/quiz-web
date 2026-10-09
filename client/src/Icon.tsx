// =============================================================================
// ★★★ 버튼·조작용 아이콘 — 한 세트 (R042 · 건우: "아이콘 테마를 통일. 요즘 스타일로")
//
// ★ 세트: Lucide (선 아이콘 · 같은 굵기 · ISC 라이선스). npm lucide-react — 클라이언트 빌드에 들어가 **우리 서버가 낸다**(외부 CDN 없음).
// ★ 크기는 글자 크기를 따른다(1.15em) — 버튼 글자가 화면에 따라 커지면(R041) 아이콘도 같이 커진다. 선 굵기 2.
// ★★ 반응용 이모티콘(👍😂 …)은 Twemoji 그대로다 — 버튼 아이콘과 반응 이모티콘을 나눈다 (Emoji.tsx).
// =============================================================================

import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  className?: string;
  /** 채우기 (방장 왕관 등) */
  fill?: string;
}

export default function Icon({ icon: C, className, fill }: Props) {
  return (
    <C
      className={className ? `ico ${className}` : 'ico'}
      size="1.15em"
      strokeWidth={2}
      fill={fill ?? 'none'}
      aria-hidden="true"
      focusable="false"
    />
  );
}
