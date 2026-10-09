// =============================================================================
// ⓘ 안내 (R034) — 화면에 늘 깔려 있던 안내 문장을 여기로 접어 넣는다
//
// ★ 건우: "안내·단축키 설명은 ⓘ 안으로." 문제·참여자 칸이 넓어진다.
// ★ 누르면 아래로 작은 창이 열린다 (absolute — 문서 높이를 늘리지 않는다 / 한 화면 게이트).
//   창 밖을 누르거나 Esc 면 닫힌다.
// =============================================================================

import { useEffect, type ReactNode } from 'react';
import { usePopup } from './popup.js';
import Icon from './Icon.js';
import { Info, X } from 'lucide-react';

interface Props {
  label?: string;
  children: ReactNode;
}

export default function InfoTip({ label = '안내', children }: Props) {
  // ★ R041 — 팝업은 한 번에 하나
  const [open, setOpen] = usePopup('info');
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.infotip')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return (
    <span className="infotip">
      <button
        type="button"
        className="ghost tiny infotip-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={Info} />
        <span className="lbl">{label}</span>
      </button>
      {open && (
        <div className="infotip-pop" role="dialog" aria-label={label}>
          {/* ★ R041 (건우) — ✕ 닫기 (모바일에서 가장자리를 아슬아슬하게 눌러야 닫혔다) */}
          <button type="button" className="ghost tiny popup-close infotip-close" aria-label="닫기" onClick={() => setOpen(false)}>
            <Icon icon={X} />
          </button>
          {children}
        </div>
      )}
    </span>
  );
}
