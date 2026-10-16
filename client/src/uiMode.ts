// =============================================================================
// ★★★ PC / 모바일 판정 (R050 · D-232 — 찬종 확정)
//
// ★ 찬종: "중요한건 넓은 화면 크기 + 단축키 사용(키보드 환경)이 필수라는거야. 이 환경에서만 웹(pc) ui 와 pc 아이콘을 적용하고
//   이 외라면 모바일 취급이 맞는거 같음." · "태블릿이나 갤럭시 폴드 같은류 … 모바일형으로 잘 나타나게"
// ★ PC = `(hover: hover) and (pointer: fine)` **그리고** 화면 폭 ≥ PC_MIN_WIDTH(지금 PC 배치 기준 1000px). 그 밖은 전부 모바일 UI.
//   → 옛 기준(폭만 999px 이하)에서 **넓은 터치 기기**(iPad 가로 · 갤럭시 탭 가로 · 폴드 펼침)가 모바일로 바뀐다.
// ★ 창 크기 · 입력 장치가 바뀌면(태블릿에 키보드 · 트랙패드 연결 등) 다시 판정한다 (matchMedia change + resize).
// ★ CSS 는 `<html class="ui-pc | ui-mobile">` 를 본다 — 옛 `@media (max-width: 999px)` 규칙은 `:where(.ui-mobile) …` 로,
//   `@media (min-width: 1000px)` 는 `:where(.ui-pc) …` 로 바꿨다(:where 라 우선순위가 그대로다 — 옛 규칙과 같은 순서로 이긴다).
//   480px 같은 "아주 좁은 폰" 규칙은 폭 그대로 둔다.
// ★ 서버에는 'pc' | 'mobile' 을 알린다(client.device) — 참여자 칸 🖥/📱 과 기록. 판정 · 점수에는 쓰지 않는다.
// =============================================================================

import { useEffect, useState } from 'react';

export type UiMode = 'pc' | 'mobile';

/** ★ 지금 PC 배치(3열 · 참여자 칸)가 시작되는 폭. CSS 와 같은 값 */
export const PC_MIN_WIDTH = 1000;

const FINE_QUERY = '(hover: hover) and (pointer: fine)';

/** 지금 환경을 잰다 (DOM 을 바꾸지 않는다) */
export function detectUiMode(): UiMode {
  if (typeof window === 'undefined') return 'pc';
  // ★ 검사(ui-check)가 강제로 정할 수 있다 — 사람 설정이 아니다
  try {
    const forced = localStorage.getItem('qw.uiMode');
    if (forced === 'pc' || forced === 'mobile') return forced;
  } catch {
    /* 없음 */
  }
  const fine = window.matchMedia(FINE_QUERY).matches;
  return fine && window.innerWidth >= PC_MIN_WIDTH ? 'pc' : 'mobile';
}

let current: UiMode | null = null;

/** 지금 판정 (installUiMode 전이면 바로 잰다) */
export function uiMode(): UiMode {
  return current ?? detectUiMode();
}

/** 모바일 UI 인가 (옛 `matchMedia('(max-width: 999px)')` 자리) */
export function isMobileUi(): boolean {
  return uiMode() === 'mobile';
}

function apply(next: UiMode): void {
  const el = document.documentElement;
  el.classList.toggle('ui-pc', next === 'pc');
  el.classList.toggle('ui-mobile', next === 'mobile');
  el.dataset.ui = next;
  if (current === next) return;
  const first = current === null;
  current = next;
  if (!first) window.dispatchEvent(new CustomEvent('qw:ui-mode', { detail: next }));
}

/** ★ 첫 렌더 전에 부른다(main.tsx) — 클래스를 붙이고 바뀌면 다시 판정한다 */
export function installUiMode(): void {
  apply(detectUiMode());
  const re = () => apply(detectUiMode());
  window.addEventListener('resize', re);
  window.addEventListener('orientationchange', re);
  try {
    window.matchMedia(FINE_QUERY).addEventListener('change', re);
  } catch {
    /* 옛 브라우저 */
  }
}

/** 화면 코드가 판정 변화에 맞춰 다시 그리게 */
export function useUiMode(): UiMode {
  const [mode, setMode] = useState<UiMode>(uiMode());
  useEffect(() => {
    const on = (e: Event) => setMode((e as CustomEvent<UiMode>).detail);
    window.addEventListener('qw:ui-mode', on);
    setMode(uiMode());
    return () => window.removeEventListener('qw:ui-mode', on);
  }, []);
  return mode;
}
