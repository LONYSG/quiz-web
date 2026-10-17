// =============================================================================
// ★★★ 미니게임 4차 (R054 · D-244) — 풍선 불기 · 연타 10초 (데이터 없는 🟢 — 설계 에이전트가 docs/17 1-2 에서)
// =============================================================================

import { seededRandom } from '../balance.js';

// ── 풍선 불기 — 누르는 동안 커진다(초당 +10%) · 떼면 그 크기가 점수 · 터지면 0
export const BALLOON_ROUNDS = 3;
export const BALLOON_PLAY_MS = 10_000;
export const BALLOON_START_PCT = 100;
export const BALLOON_GROW_PER_SEC = 10;
/** 터지는 크기 범위(%) — 판마다 서버 시드 · 같은 판은 모두 같은 값(공정성) · 화면에는 판 결과 때만 */
export const BALLOON_BURST_MIN = 120;
export const BALLOON_BURST_MAX = 300;

export function balloonBursts(seed: number): number[] {
  const rnd = seededRandom((seed ^ 0xba11) >>> 0);
  return Array.from({ length: BALLOON_ROUNDS }, () => Math.round((BALLOON_BURST_MIN + rnd() * (BALLOON_BURST_MAX - BALLOON_BURST_MIN)) * 10) / 10);
}

/** 누른 시간(ms) → 크기(%) */
export function balloonSize(holdMs: number): number {
  return BALLOON_START_PCT + (Math.max(0, holdMs) / 1000) * BALLOON_GROW_PER_SEC;
}

// ── 연타 10초 — 횟수(많은 순) · 자동 반복은 버린다 · 초당 20 넘으면 거부
export const TAP_ROUNDS = 3;
export const TAP_PLAY_MS = 10_000;
export const TAP_MAX_PER_SEC = 20;
