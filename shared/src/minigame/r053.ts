// =============================================================================
// ★★★ 미니게임 3차 (R053 · D-241) — 소수파 게임 · 평균의 2/3 · 다른 하나 찾기 · 게이지 정중앙 멈추기
//
// ★ 설계 판단(2026-10-17): docs/17 1-2 의 🟢 후보 중 **데이터 없이 되고 느낌이 서로 다른 것**(심리전 2 · 관찰 1 · 타이밍 1).
// ★ 이 파일은 순수 함수만 — 서버(판정)와 화면(표시)이 같이 쓴다. 판정은 서버가 다시 계산한다(클라이언트 값은 안 믿는다).
// =============================================================================

import { seededRandom } from '../balance.js';
import { ODD_PAIRS, type OddPair } from './oddone-pairs.js';

// ─────────────────────────────────────────────────────────────────────────────
// 소수파 게임 — 1~5 중 하나 · 가장 적게 고른 수(0명 제외)를 고른 사람 전원이 판 1위
// ─────────────────────────────────────────────────────────────────────────────
export const MINORITY_ROUNDS = 5;
export const MINORITY_PLAY_MS = 8_000;
export const MINORITY_CHOICES = [1, 2, 3, 4, 5] as const;
export const MINORITY_MIN_PLAYERS = 3;

export interface MinorityResult {
  /** 숫자 → 고른 사람 수 (1~5 모두) */
  counts: Record<number, number>;
  /** 소수파 숫자들(가장 적게 · 0명 제외 · 공동이면 여럿). 모두 같은 수를 골랐거나(한 숫자뿐) 아무도 안 골랐으면 [] */
  minority: number[];
}

export function minorityResult(picks: readonly number[]): MinorityResult {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of picks) if (counts[p] !== undefined) counts[p] += 1;
  const used = MINORITY_CHOICES.filter((c) => counts[c]! > 0);
  // ★ 고른 숫자가 하나뿐(모두 같은 수)이면 소수파가 없다 → 전원 0
  if (used.length <= 1) return { counts, minority: [] };
  const min = Math.min(...used.map((c) => counts[c]!));
  // ★ 고른 숫자들이 모두 같은 수의 사람이면(예: 1·2·3 을 한 명씩) — 가장 적게 고른 수가 전부다 → 전원 1위
  return { counts, minority: used.filter((c) => counts[c] === min) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 다른 하나 찾기 — 격자 4·5·6·6·7 · 1~2판 쉬운 쌍 · 3~5판 어려운 쌍 · 틀리면 +2초
// ─────────────────────────────────────────────────────────────────────────────
export const ODDONE_SIZES = [4, 5, 6, 6, 7] as const;
export const ODDONE_PLAY_MS = 10_000;
export const ODDONE_PENALTY_MS = 2_000;

export interface OddRound {
  size: number;
  pair: OddPair;
  /** 다른 하나의 칸 번호(0 ~ size²−1) */
  oddIndex: number;
}

export function oddoneRounds(seed: number): OddRound[] {
  const rnd = seededRandom((seed ^ 0x0dd0e) >>> 0);
  const easy = ODD_PAIRS.filter((p) => p.level === 'easy');
  const hard = ODD_PAIRS.filter((p) => p.level === 'hard');
  const used = new Set<OddPair>();
  return ODDONE_SIZES.map((size, i) => {
    const pool = (i < 2 ? easy : hard).filter((p) => !used.has(p));
    const pair = pool[Math.floor(rnd() * pool.length)]!;
    used.add(pair);
    // 바꿔 넣기(어느 쪽이 '하나' 인지)도 판마다
    const swapped = rnd() < 0.5 ? { ...pair, base: pair.odd, odd: pair.base } : pair;
    return { size, pair: swapped, oddIndex: Math.floor(rnd() * size * size) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 게이지 정중앙 멈추기 — 왕복 주기 2.0 · 1.6 · 1.2 · 0.9 · 0.7초 · 4~5판 가운데 30% 가림
// ─────────────────────────────────────────────────────────────────────────────
export const GAUGE_PERIODS_MS = [2000, 1600, 1200, 900, 700] as const;
export const GAUGE_PLAY_MS = 10_000;
/** 가운데 가림 구간 폭(%) — 4~5판 */
export const GAUGE_HIDE_PCT = 30;
export const GAUGE_HIDE_FROM_ROUND = 3; // 0-based → 4판째부터

export interface GaugeRound {
  periodMs: number;
  /** 시작 위상(0~1) — 판마다 다르게(늘 왼쪽 끝에서 시작하지 않게) */
  phase0: number;
  hidden: boolean;
}

export function gaugeRounds(seed: number): GaugeRound[] {
  const rnd = seededRandom((seed ^ 0x6a06e) >>> 0);
  return GAUGE_PERIODS_MS.map((periodMs, i) => ({ periodMs, phase0: Math.round(rnd() * 1000) / 1000, hidden: i >= GAUGE_HIDE_FROM_ROUND }));
}

/** 판 시작부터 t ms 뒤 표시자 위치(0 = 왼쪽 끝 · 1 = 오른쪽 끝) — 일정한 속도로 왕복 */
export function gaugePos(r: Pick<GaugeRound, 'periodMs' | 'phase0'>, tMs: number): number {
  const ph = (((tMs / r.periodMs + r.phase0) % 1) + 1) % 1;
  return ph < 0.5 ? ph * 2 : 2 - ph * 2;
}

/** 가운데에서 떨어진 거리 % (0 = 정중앙 · 100 = 끝) */
export function gaugeOffPct(pos: number): number {
  return Math.abs(pos - 0.5) * 200;
}
