// =============================================================================
// ★★ 로딩 버튼 — 서버를 기다리는 모든 동작에 하나 (R043 A-2 · 건우: "로딩 표시가 없으니 계속 누르게 된다")
//
// ★ busy 동안: 버튼이 잠기고(disabled) 글자 자리에 돌아가는 표시. **버튼 폭은 그대로**(글자는 투명하게 남긴다) — 옆 요소가 밀리지 않는다.
// ★ 글자(textContent)는 그대로라 화면 검사의 버튼 이름도 그대로다.
// =============================================================================

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import Icon from './Icon.js';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy: boolean;
  children: ReactNode;
}

export default function BusyButton({ busy, children, className, disabled, type = 'button', ...rest }: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={[className, 'busy-btn', busy ? 'is-busy' : ''].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      <span className="busy-label">{children}</span>
      {busy && (
        <span className="busy-spin" aria-hidden="true">
          <Icon icon={LoaderCircle} className="spin" />
        </span>
      )}
    </button>
  );
}
