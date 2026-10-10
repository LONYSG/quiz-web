// =============================================================================
// ★ 팝업 닫기 ✕ — 모든 팝업이 같은 크기 · 같은 자리 (R043 A-8 · 건우: "✕ 가 너무 크다. 모든 팝업에")
//   자리: 팝업 오른쪽 위 (popup-close 규칙 — 28px). 아이콘은 Lucide X.
// =============================================================================

import { X } from 'lucide-react';
import Icon from './Icon.js';

export default function PopupClose({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <button type="button" className={className ? `popup-close ${className}` : 'popup-close'} aria-label="닫기" onClick={onClose}>
      <Icon icon={X} />
    </button>
  );
}
