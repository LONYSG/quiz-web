// =============================================================================
// ★★ 보너스 포인트 토스트 (R059 · D-254) — 로그인 뒤 한 번: 아직 알리지 않은 지급(제보 채택 · 이달의 제보왕 · 운영자 지급)
//   POST /api/me/grants/claim 이 읽고 seen_at 을 적는다 → 여러 건이면 합쳐서 한 번. 업적 토스트와 같은 띠.
// =============================================================================

import { useEffect, useState } from 'react';
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
  if (grants.every((g) => g.reason === 'signup')) return { title: `가입 선물 +${total}P`, detail: '이모티콘샵에서 써 보세요' };
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
  useEffect(() => {
    let alive = true;
    void fetch('/api/me/grants/claim', { method: 'POST', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { grants?: Grant[] } | null) => {
        const t = grantToastText(j?.grants ?? []);
        if (!alive || !t) return;
        setText(t);
        sfx('mg-final');
        window.setTimeout(() => alive && setText(null), 7000);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId]);
  if (!text) return null;
  return (
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
  );
}
