// =============================================================================
// ★★★ 각도 맞추기 (R051 · D-237) — 제시 각도를 손으로 만들기
//
// ★ 찬종: "제시 각도를 손으로 만들기".
// ★ 3판 · 판마다 10초. 꼭짓점 + 오른쪽 기준 반직선 고정 · 목표 각도 숫자("37°" — 15~165 무작위 · 5의 배수는 피함 · 한 판 안 같은 각 없음)
//   · 다른 반직선 끝을 끌어(마우스 · 손가락 · PC ← → 0.5°씩 · 꾹 누르면 가속) 만든다 · 눈금 없음 · 확정(Space · Enter · 버튼) 또는 10초 끝.
// ★ 값 = |내 각 − 목표| 도(작을수록 좋다) · 표시 소수 규칙(최대 둘째 자리).
// ★ 설계 판단: 시작 각은 사람마다 다르다(시드 + 계정 — 균형의 시작 점과 같은 꼴) · 목표에서 30° 이상 떨어진 곳.
//   한 판 안의 목표끼리는 15° 이상 떨어진다(비슷한 각이 연달아 나오지 않게).
// =============================================================================

import { seededRandom } from '../balance.js';

export const ANGLE_ROUNDS = 3;
export const ANGLE_PLAY_MS = 10_000;
export const ANGLE_MIN = 15;
export const ANGLE_MAX = 165;
export const ANGLE_KEY_STEP = 0.5;
const MIN_APART = 15;
const START_AWAY = 30;

/** 목표 각 — 정수 · 5의 배수 아님 · 서로 15° 이상 */
export function angleTargets(seed: number, n = ANGLE_ROUNDS): number[] {
  const rnd = seededRandom((seed ^ 0xa49e) >>> 0);
  const out: number[] = [];
  let guard = 0;
  while (out.length < n && guard < 10_000) {
    guard += 1;
    const a = ANGLE_MIN + Math.floor(rnd() * (ANGLE_MAX - ANGLE_MIN + 1));
    if (a % 5 === 0) continue;
    if (out.some((b) => Math.abs(a - b) < MIN_APART)) continue;
    out.push(a);
  }
  return out;
}

/** 사람마다 다른 시작 각 (목표에서 30° 이상) */
export function angleStart(seed: number, accountId: string, round: number, target: number): number {
  let h = (seed ^ 0x51a7) >>> 0;
  for (const ch of `${accountId}:${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  const rnd = seededRandom(h);
  for (let i = 0; i < 50; i += 1) {
    const a = 10 + rnd() * 160;
    if (Math.abs(a - target) >= START_AWAY) return Math.round(a * 10) / 10;
  }
  return target > 90 ? 20 : 160;
}

export function clampAngle(a: number): number {
  return Math.min(180, Math.max(0, a));
}

/** 꼭짓점에서 본 점의 각 (위가 + · 오른쪽 0° · 0~180 으로 자른다 — 아래쪽은 가까운 끝으로) */
export function angleOfPoint(dx: number, dyUp: number): number {
  let a = (Math.atan2(dyUp, dx) * 180) / Math.PI;
  if (a < 0) a = a < -90 ? 180 : 0;
  return clampAngle(a);
}

export function angleError(deg: number, target: number): number {
  return Math.abs(clampAngle(deg) - target);
}
