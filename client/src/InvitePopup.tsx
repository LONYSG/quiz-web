// =============================================================================
// ★★ 초대 팝업 (R043 A-7 · 건우 확정: 방 코드(크게) + 링크 복사)
//
// ★ 자리: PC 는 설정 창처럼 버튼 아래 작은 창(prefs-pop 과 같은 틀) / 모바일은 화면 가운데(R040 C-1 규칙) — ☰ 안의 초대도 이 창.
// ★ 방 코드 6자리는 전화로 불러 주기 쉽게 크게, 세 자리씩 띄워 보인다. 코드 · 링크 둘 다 복사할 수 있다.
// ★ 팝업은 하나 (popup.ts 'invite') · ✕ 는 다른 팝업과 같은 PopupClose.
// =============================================================================

import { useState } from 'react';
import { Check, Copy, Link } from 'lucide-react';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';

interface Props {
  code: string;
  url: string;
  onClose: () => void;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ★ 클립보드 API 가 막힌 환경(비-https 등) — 숨은 입력칸으로 복사한다
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  }
}

export default function InvitePopup({ code, url, onClose }: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const copy = (what: 'code' | 'link') => {
    void copyText(what === 'code' ? code : url).then(() => {
      setCopied(what);
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
    });
  };
  return (
    <div className="invite-pop" role="dialog" aria-label="초대">
      <div className="pop-head">
        <p className="pop-title">초대</p>
        <PopupClose onClose={onClose} />
      </div>
      <p className="invite-label">방 코드</p>
      <p className="invite-code mono" aria-label={`방 코드 ${code}`}>
        {code.slice(0, 3)} {code.slice(3)}
      </p>
      <div className="invite-actions">
        <button type="button" className="ghost" onClick={() => copy('code')}>
          <Icon icon={copied === 'code' ? Check : Copy} /> {copied === 'code' ? '복사됨' : '코드 복사'}
        </button>
        <button type="button" className="primary" onClick={() => copy('link')}>
          <Icon icon={copied === 'link' ? Check : Link} /> {copied === 'link' ? '복사됨' : '링크 복사'}
        </button>
      </div>
    </div>
  );
}
