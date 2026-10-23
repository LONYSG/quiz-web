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

/** 누른 시간(ms) → 크기(%) — ★ R063 전 규칙(기록 · 실험실만) */
export function balloonSize(holdMs: number): number {
  return BALLOON_START_PCT + (Math.max(0, holdMs) / 1000) * BALLOON_GROW_PER_SEC;
}

// ── ★★ R063 (D-261 · 찬종 확정 "블랙잭 처럼 … 특정 지점에 도달하면 만점 … 넘으면 터지는거임") — 펌프 규칙
//   한 판: 목표 100(늘 보임) · [펌프] 마다 바람 6~16(판 시드 + 계정으로 정한 순서 — 서버만 안다 · 누르면 바로 알려 줌) ·
//   [그만] 으로 멈춤 · 딱 100 = 만점(동점 가능) · 100 넘으면 펑 = 0 · 12초가 지나면 그 값으로 멈춤 · 판 점수 = 멈춘 값(높을수록 좋다).
export const BALLOON_TARGET = 100;
export const BALLOON_PUMP_MS = 12_000;
export const BALLOON_PUMP_MIN = 6;
export const BALLOON_PUMP_MAX = 16;
/** 한 판 최대 펌프 수(6 × 17 > 100 — 그 전에 반드시 넘는다) */
export const BALLOON_MAX_PUMPS = 17;

function hashStr(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}
/** 그 판 · 그 사람의 펌프 바람 순서(앞 n 개) */
export function balloonPumps(roundSeed: number, accountId: string, n: number): number[] {
  const rnd = seededRandom((roundSeed ^ hashStr(accountId) ^ 0x9e37) >>> 0);
  return Array.from({ length: Math.max(0, Math.min(n, BALLOON_MAX_PUMPS)) }, () => BALLOON_PUMP_MIN + Math.floor(rnd() * (BALLOON_PUMP_MAX - BALLOON_PUMP_MIN + 1)));
}
/** 펌프 n 번 뒤 바람 합 · 터졌나 */
export function balloonAfter(roundSeed: number, accountId: string, n: number): { total: number; last: number; popped: boolean } {
  const seq = balloonPumps(roundSeed, accountId, n);
  const total = seq.reduce((a, b) => a + b, 0);
  return { total, last: seq[seq.length - 1] ?? 0, popped: total > BALLOON_TARGET };
}

// ── 연타 10초 — 횟수(많은 순) · 자동 반복은 버린다 · 초당 20 넘으면 거부
export const TAP_ROUNDS = 3;
export const TAP_PLAY_MS = 10_000;
export const TAP_MAX_PER_SEC = 20;
