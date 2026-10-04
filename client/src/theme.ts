// =============================================================================
// 테마 (R033 — 디자인 전면 개편)
//
// ★ 건우: "UI 나 UX 가 너무 별로다 … 밝은 화면도 좋다" (Q-34 다크 단일 폐기)
// ★★ 진행 방식 — 시안을 따로 고르지 않는다. **실제 게임에 테마 세 개를 바꿔 끼울 수 있게** 두고
//   건우가 플레이하며 고른다. 다음 라운드에 고른 것만 남긴다.
//
// ★ 색·둥글기·그림자·테두리 두께는 전부 styles.css 의 `[data-theme]` 토큰 한 곳에 있다.
//   ★ 화면 코드는 토큰(var(--…))만 쓴다. 테마를 추가·삭제해도 화면 코드는 그대로다.
// ★ 고른 테마는 localStorage 에 남는다 — 같은 브라우저에서 다시 들어와도 유지된다.
// =============================================================================

export type ThemeId = 'pastel' | 'pop' | 'night';

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  /** 한 줄 설명 (설정 창에 보인다) */
  desc: string;
}

/** ★ 순서가 Alt+T 순환 순서다. 첫째가 기본값이다 */
export const THEMES: readonly ThemeInfo[] = [
  { id: 'pastel', label: '파스텔', desc: '밝고 부드러운 색 · 둥근 모양 (캐치마인드 느낌)' },
  { id: 'pop', label: '원색', desc: '쨍한 원색 · 굵은 테두리 · 만화 같은 그림자' },
  { id: 'night', label: '밤', desc: '어두운 바탕 · 형광 포인트' },
];

const KEY = 'qw.theme.v1';

function isTheme(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (isTheme(v)) return v;
  } catch {
    /* 저장소를 못 쓰는 환경이면 기본값 */
  }
  return THEMES[0]!.id;
}

/** html 요소에 붙인다. CSS 가 이것 하나로 테마를 고른다 */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
}

export function setTheme(id: ThemeId): void {
  applyTheme(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* 무시 — 이번 세션에는 적용된다 */
  }
  window.dispatchEvent(new CustomEvent('qw:theme', { detail: id }));
}

export function cycleTheme(): ThemeId {
  const i = THEMES.findIndex((t) => t.id === getTheme());
  const next = THEMES[(i + 1) % THEMES.length]!.id;
  setTheme(next);
  return next;
}

/** 첫 렌더 전에 부른다 — 기본 테마로 한 번 번쩍이는 것을 막는다 */
export function initTheme(): void {
  applyTheme(getTheme());
}
