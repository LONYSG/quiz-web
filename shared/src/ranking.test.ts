// =============================================================================
// 순위 계산 / 스킵 임계값 테스트
// guide 39절(동점 공동 순위), guide 22절 + Q-28(스킵 임계값)
// =============================================================================

import { describe, expect, it } from 'vitest';
import { computeRanking, skipThreshold } from './ranking.js';

describe('computeRanking — guide 39절 동점 공동 순위', () => {
  it('guide 39절 명시 예시: 15 / 15 / 12 → 1위 / 1위 / 3위', () => {
    const result = computeRanking([
      { name: '철수', score: 15 },
      { name: '영희', score: 15 },
      { name: '민수', score: 12 },
    ]);
    expect(result.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('guide 38절 예시: 18 / 15 / 11 / 7 → 1 / 2 / 3 / 4', () => {
    const result = computeRanking([
      { name: '철수', score: 18 },
      { name: '영희', score: 15 },
      { name: '민수', score: 11 },
      { name: '준호', score: 7 },
    ]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('입력 순서와 무관하게 점수 내림차순으로 정렬한다', () => {
    const result = computeRanking([
      { name: 'a', score: 3 },
      { name: 'b', score: 9 },
      { name: 'c', score: 5 },
    ]);
    expect(result.map((r) => r.name)).toEqual(['b', 'c', 'a']);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('3인 동점이면 1/1/1 이고 다음이 4위', () => {
    const result = computeRanking([
      { score: 5 },
      { score: 5 },
      { score: 5 },
      { score: 1 },
    ]);
    expect(result.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it('전원 0점이면 전원 1위 (guide 38절: 최종 결과에 모두 포함)', () => {
    const result = computeRanking([{ score: 0 }, { score: 0 }]);
    expect(result.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('빈 배열은 빈 배열', () => {
    expect(computeRanking([])).toEqual([]);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const input = [{ score: 1 }, { score: 5 }];
    computeRanking(input);
    expect(input.map((p) => p.score)).toEqual([1, 5]);
  });
});

describe('skipThreshold — guide 22절 + Q-28 확정표', () => {
  // Q-28 확정: 2명=2 / 3명=2 / 4명=3 / 5명=4 / 6명=5 / 7명=6 / 8명=7 / 9명=8 / 10명=8
  const table: Array<[active: number, expected: number | null]> = [
    [0, null],
    [1, null], // ★ 활성 1명이면 투표 불가. 방장 강제 스킵만 가능 (guide 23절)
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 5],
    [7, 6],
    [8, 7],
    [9, 8],
    [10, 8],
  ];

  for (const [active, expected] of table) {
    it(`활성 ${active}명 → ${expected === null ? '투표 불가' : `${expected}표`}`, () => {
      expect(skipThreshold(active)).toBe(expected);
    });
  }

  it('★ 어떤 인원에서도 0표나 1표로 스킵되지 않는다 (guide 22절 명시 요구)', () => {
    for (let n = 2; n <= 10; n += 1) {
      const t = skipThreshold(n);
      expect(t).not.toBeNull();
      expect(t!).toBeGreaterThanOrEqual(2);
    }
  });

  it('★ 임계값이 활성 인원을 초과하지 않는다 (도달 불가능한 조건 금지)', () => {
    for (let n = 2; n <= 10; n += 1) {
      expect(skipThreshold(n)!).toBeLessThanOrEqual(n);
    }
  });

  it('활성 4명 이상에서는 전원 동의를 요구하지 않는다 (guide 22절)', () => {
    // 2명과 3명은 하한 2표 때문에 예외다. Q-28이 이를 명시적으로 허용한다.
    for (let n = 4; n <= 10; n += 1) {
      expect(skipThreshold(n)!).toBeLessThan(n);
    }
  });

  it('비정상 입력은 null', () => {
    expect(skipThreshold(-1)).toBe(null);
    expect(skipThreshold(Number.NaN)).toBe(null);
    expect(skipThreshold(Number.POSITIVE_INFINITY)).toBe(null);
  });
});
