// =============================================================================
// ★★ R066 (D-288) — 한 번만 보여 줄 것들의 표시(계정에 저장 — prefsSync · 로그인 전엔 이 브라우저에만)
//   shopOpened     — 포인트샵을 한 번이라도 열었나(안 열었고 포인트가 있으면 빨간 점 · 찬종 #39)
//   emojiGuideSeen — 첫 이모티콘 가이드를 봤나(찬종 #40) — ★ R073 (D-318) 가이드는 안내 카드로 합쳤다: 받아서 남기기만 하고 쓰지 않는다
//   ★★ R073 emojiHelpDismissed — 😊 안내 카드 "다시 보지 않음"(D-318) · tourSeen — 첫 안내 투어를 봤나(D-319 · 기존 계정은 없음 → 모두 한 번)
// =============================================================================

import { useEffect, useState } from 'react';

//   ★★ R074 emojiDemoSeen — 😊 창 자동 시연을 봤나(D-321 가 · 기존 계정은 없음 → 모두 한 번)
export type AccountFlag = 'shopOpened' | 'emojiGuideSeen' | 'emojiHelpDismissed' | 'tourSeen' | 'emojiDemoSeen';
export const ACCOUNT_FLAGS: readonly AccountFlag[] = ['shopOpened', 'emojiGuideSeen', 'emojiHelpDismissed', 'tourSeen', 'emojiDemoSeen'];

const keyOf = (f: AccountFlag) => `qw.flag.${f}`;

export function getFlag(f: AccountFlag): boolean {
  try {
    return localStorage.getItem(keyOf(f)) === '1';
  } catch {
    return false;
  }
}

/** quiet = 계정 값을 적용하는 중(prefsSync) — 다시 저장하지 않게 이벤트는 그대로 낸다(prefsSync 가 applying 으로 거른다) */
export function setFlag(f: AccountFlag, on = true): void {
  if (getFlag(f) === on) return;
  try {
    localStorage.setItem(keyOf(f), on ? '1' : '0');
  } catch {
    /* 이번 세션만 */
  }
  window.dispatchEvent(new CustomEvent('qw:flags', { detail: f }));
}

export function useFlag(f: AccountFlag): boolean {
  const [on, setOn] = useState(() => getFlag(f));
  useEffect(() => {
    const h = () => setOn(getFlag(f));
    window.addEventListener('qw:flags', h);
    return () => window.removeEventListener('qw:flags', h);
  }, [f]);
  return on;
}
