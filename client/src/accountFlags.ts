// =============================================================================
// ★★ R066 (D-288) — 한 번만 보여 줄 것들의 표시(계정에 저장 — prefsSync · 로그인 전엔 이 브라우저에만)
//   shopOpened     — 포인트샵을 한 번이라도 열었나(안 열었고 포인트가 있으면 빨간 점 · 찬종 #39)
//   emojiGuideSeen — 첫 이모티콘 가이드를 봤나(찬종 #40 · 한 번만 · ⓘ 에서 다시 보기)
// =============================================================================

import { useEffect, useState } from 'react';

export type AccountFlag = 'shopOpened' | 'emojiGuideSeen';
export const ACCOUNT_FLAGS: readonly AccountFlag[] = ['shopOpened', 'emojiGuideSeen'];

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
