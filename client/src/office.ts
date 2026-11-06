// =============================================================================
// ★★★ R074 (D-322 · 찬종 2026-11-05 친구 제보 "사무실 모드 — 회사 동료와 사무실에서 할 때 슬쩍 봤을 때 딴짓 하는지 모르게 ·
//   cmd 창처럼 보이면 어때? 한번 만들어 봐") — 사무실 테마가 켜고 끄는 것들(색 · 글꼴은 styles.css [data-theme='office'] 블록)
//
// ★ 기본값 넷(찬종 "ㅇㅇ" · 1판 — 되돌리기 쉽게):
//   ① 이모티콘 · 아바타 그림 → 글자(Emoji.tsx · Avatar.tsx 가 useIsOffice 로 고른다)
//   ② 소리 기본 끔 — 사무실로 바꾸는 순간 끄고 한 줄 안내 · 다시 켤 수 있음 · 테마를 되돌리면 **전 값 복원**(이 브라우저에 둔다)
//   ③ 탭 제목 "명령 프롬프트" · 파비콘 검은 네모 — 되돌리면 원래("상식 퀴즈" · 파비콘 없음)
//   ④ 세레모니 · 튀어 오르기 · 흔들림 없음 — CSS(animation · transition 끔 = prefers-reduced-motion 과 같은 길)
// ★ 미니게임 그림은 그대로 보인다(사용자 선택 — R074 7절 후보).
// =============================================================================

import { useEffect, useState } from 'react';
import { getTheme, type ThemeId } from './theme.js';
import { getSoundPrefs, setSoundPrefs } from './sound.js';
import { enterOfficeSound, leaveOfficeSound } from './officeSound.js';
export { enterOfficeSound, leaveOfficeSound };

export const OFFICE_TITLE = '명령 프롬프트';
const NORMAL_TITLE = '상식 퀴즈';
/** 검은 네모 하나 — 16×16 SVG · ★ R075 (D-322 2판) 프롬프트 줄 · 흰 띠를 뺐다(장식 0) */
const OFFICE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%230c0c0c'/%3E%3C/svg%3E";

/** 탭 제목 · 파비콘 */
export function applyOfficeTab(on: boolean): void {
  document.title = on ? OFFICE_TITLE : NORMAL_TITLE;
  let link = document.querySelector<HTMLLinkElement>('link[data-office-icon]');
  if (on) {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.dataset.officeIcon = '1';
      document.head.appendChild(link);
    }
    link.href = OFFICE_ICON;
  } else link?.remove();
}

/** 소리를 끈 순간 한 줄 안내(Lobby 가 듣는다 — 토스트) */
export const OFFICE_NOTICE = 'qw:office-notice';

let last: ThemeId | null = null;
/** main.tsx 에서 한 번 — 테마가 바뀔 때마다 사무실 들어감/나감을 본다 */
export function installOffice(): void {
  last = getTheme();
  applyOfficeTab(last === 'office');
  window.addEventListener('qw:theme', (e) => {
    const next = (e as CustomEvent<ThemeId>).detail;
    const prev = last;
    last = next;
    if (prev === next) return;
    if (next === 'office') {
      const muted = enterOfficeSound(localStorage, getSoundPrefs, setSoundPrefs);
      applyOfficeTab(true);
      if (muted) window.dispatchEvent(new CustomEvent(OFFICE_NOTICE, { detail: '사무실 모드 — 소리를 껐어요 (⚙ 에서 다시 켤 수 있어요)' }));
    } else if (prev === 'office') {
      leaveOfficeSound(localStorage, setSoundPrefs);
      applyOfficeTab(false);
    }
  });
}

/** 지금 사무실 모드인가(바뀌면 다시 그린다) */
export function useIsOffice(): boolean {
  const [on, setOn] = useState(() => getTheme() === 'office');
  useEffect(() => {
    const h = (e: Event) => setOn((e as CustomEvent<ThemeId>).detail === 'office');
    window.addEventListener('qw:theme', h);
    return () => window.removeEventListener('qw:theme', h);
  }, []);
  return on;
}
