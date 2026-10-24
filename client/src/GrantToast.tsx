// =============================================================================
// ★★ 보너스 포인트 토스트 (R059 · D-254) — 로그인 뒤 한 번: 아직 알리지 않은 지급(제보 채택 · 이달의 제보왕 · 운영자 지급)
//   POST /api/me/grants/claim 이 읽고 seen_at 을 적는다 → 여러 건이면 합쳐서 한 번. 업적 토스트와 같은 띠.
// =============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift } from 'lucide-react';
import Icon from './Icon.js';
import { openPopup } from './popup.js';
import { sfx } from './sound.js';

interface Grant {
  id: string;
  amount: number;
  reason: 'feedback_adopted' | 'feedback_monthly_top' | 'admin' | 'signup';
  question: string | null;
}

export function grantToastText(grants: readonly Grant[]): { title: string; detail: string } | null {
  if (grants.length === 0) return null;
  const total = grants.reduce((s, g) => s + g.amount, 0);
  const adopted = grants.filter((g) => g.reason === 'feedback_adopted');
  // ★ R063 (D-260) — 가입 선물(새 회원 · 기존 회원 소급)만이면 그 말 그대로
  if (grants.every((g) => g.reason === 'signup')) return { title: `가입 선물 +${total}P`, detail: '포인트샵에서 써 보세요' };
  const q = adopted.find((g) => g.question)?.question ?? null;
  const qText = q ? `'${q}${[...q].length >= 30 ? '…' : ''}'` : '';
  if (adopted.length === grants.length) {
    return {
      title: adopted.length === 1 ? `제보가 채택됐어요 +${total}P` : `제보 ${adopted.length}건이 채택됐어요 +${total}P`,
      detail: adopted.length === 1 ? qText : `${qText}${qText ? ' 외' : ''} — 고마워요!`,
    };
  }
  const parts = [
    adopted.length > 0 ? `제보 채택 ${adopted.length}건` : null,
    grants.some((g) => g.reason === 'feedback_monthly_top') ? '이달의 제보왕' : null,
    grants.some((g) => g.reason === 'admin') ? '운영자 지급' : null,
    grants.some((g) => g.reason === 'signup') ? '가입 선물' : null,
  ].filter(Boolean);
  return { title: `보너스 포인트 +${total}P`, detail: parts.join(' · ') };
}

export default function GrantToast({ accountId }: { accountId: string }) {
  const [text, setText] = useState<{ title: string; detail: string } | null>(null);
  // ★★ R066 (D-289 · 찬종 #39 "가입 보너스 50point는 … 회원가입 하는 순간 팝업으로") — 가입 선물은 토스트가 아니라 창 하나
  const [signup, setSignup] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch('/api/me/grants/claim', { method: 'POST', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { grants?: Grant[] } | null) => {
        const all = j?.grants ?? [];
        const gift = all.filter((g) => g.reason === 'signup');
        if (alive && gift.length > 0) {
          setSignup(gift.reduce((s, g) => s + g.amount, 0));
          sfx('mg-final');
        }
        const t = grantToastText(all.filter((g) => g.reason !== 'signup'));
        if (!alive || !t) return;
        setText(t);
        if (gift.length === 0) sfx('mg-final');
        window.setTimeout(() => alive && setText(null), 7000);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId]);
  const gift =
    signup !== null &&
    createPortal(
      <div className="modal-back popup-back" onPointerDown={(e) => e.target === e.currentTarget && setSignup(null)}>
        <div className="modal signup-gift" role="dialog" aria-label="가입 선물" data-signup-gift>
          <p className="signup-gift-ico" aria-hidden="true">
            🎁
          </p>
          <p className="signup-gift-title">
            가입 선물 <strong className="mono">{signup}P</strong>
          </p>
          <p className="dim">포인트샵에서 이모티콘을 사 보세요</p>
          <div className="signup-gift-actions">
            <button
              type="button"
              className="primary"
              autoFocus
              data-signup-shop
              onClick={() => {
                setSignup(null);
                openPopup('shop');
              }}
            >
              <Icon icon={Gift} /> 포인트샵 가기
            </button>
            <button type="button" className="ghost" onClick={() => setSignup(null)}>
              닫기
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  if (!text) return gift || null;
  return (
    <>
    {gift}
    <div className="ach-toast-layer" aria-live="polite">
      <div className="ach-toast grant-toast" role="status">
        <span className="ach-toast-medal" aria-hidden="true">
          🎁
        </span>
        <span>
          <strong>{text.title}</strong>
          {text.detail && <span className="dim"> {text.detail}</span>}
        </span>
        <button type="button" className="ghost tiny" aria-label="닫기" onClick={() => setText(null)}>
          ✕
        </button>
      </div>
    </div>
    </>
  );
}
