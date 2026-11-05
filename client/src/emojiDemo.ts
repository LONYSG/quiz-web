// =============================================================================
// ★★ R074 (D-321 가) — 😊 창 자동 시연: 판단만 하는 상태 기계(화면 · DOM 없음 — 단위 테스트가 이 파일을 본다)
//
// ★ 찬종 2026-11-05: "이모티콘 등록은 설명이 좀 더 친절해야 — 다들 왜 이렇게 어려워하지".
// ★ 처음 😊 창을 열면(계정 플래그 emojiDemoSeen 없음 · 기존 유저 전원 한 번) 고스트 이모티콘이 목록에서 1번 자리로
//   **혼자 움직여 들어가는** 3초 시연 — 끝나도 자리에 실제로 넣지 않는다 · 사용자가 누르면(어디든) 즉시 멈춘다.
//   카드의 [시연 보기] · 투어 ④ 는 언제든 다시(억지로).
// 상태: idle(창 닫힘 · 시연 없음) → armed(창이 열렸고 곧 시작 — 칸 위치를 잴 시간) → playing(3초) → done(끝 · 멈춤)
// =============================================================================

export type DemoState = 'idle' | 'armed' | 'playing' | 'done';
export type DemoEvent =
  | { type: 'open'; wanted: boolean }
  | { type: 'start' }
  | { type: 'finish' }
  | { type: 'interrupt' }
  | { type: 'replay' }
  | { type: 'close' };

/** 시연 한 번의 길이(ms) — 브리핑 "3초" */
export const DEMO_MS = 3000;
/** 창이 열린 뒤 시작까지(칸 자리를 잴 시간) */
export const DEMO_DELAY_MS = 450;

export function demoNext(s: DemoState, e: DemoEvent): DemoState {
  switch (e.type) {
    case 'open':
      return e.wanted ? 'armed' : 'idle';
    case 'start':
      return s === 'armed' ? 'playing' : s;
    case 'finish':
      return s === 'playing' ? 'done' : s;
    case 'interrupt':
      return s === 'armed' || s === 'playing' ? 'done' : s;
    case 'replay':
      return 'armed';
    case 'close':
      return 'idle';
  }
}

/** 이 바뀜에서 "봤다" 를 남기나 — 시연이 실제로 시작된 순간 한 번(중간에 멈춰도 본 것) */
export function demoMarksSeen(prev: DemoState, next: DemoState): boolean {
  return prev !== 'playing' && next === 'playing';
}

/** 지금 시연을 그리나 */
export const demoVisible = (s: DemoState): boolean => s === 'playing';

/**
 * 고스트 길 — 시작(목록 칸 가운데) → 끝(1번 자리 가운데) · t = 0~1.
 *   0~0.15 제자리에서 집어 올림(커짐) · 0.15~0.8 곡선으로 날아감 · 0.8~1 자리 위에서 내려앉음(작아짐)
 */
export function demoPoint(from: { x: number; y: number }, to: { x: number; y: number }, t: number): { x: number; y: number; scale: number } {
  const c = Math.min(1, Math.max(0, t));
  if (c < 0.15) return { x: from.x, y: from.y, scale: 1 + (c / 0.15) * 0.3 };
  if (c < 0.8) {
    const u = (c - 0.15) / 0.65;
    const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; // ease-in-out
    // 위로 볼록한 곡선(가운데가 40px 높다)
    const lift = Math.sin(Math.PI * e) * 40;
    return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - lift, scale: 1.3 };
  }
  const v = (c - 0.8) / 0.2;
  return { x: to.x, y: to.y, scale: 1.3 - v * 0.3 };
}
