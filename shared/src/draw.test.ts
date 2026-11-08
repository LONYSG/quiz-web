// R083 — 캐치마인드 순수 함수
import { describe, expect, it } from 'vitest';
import { DRAW, drawDrawerScore, drawLengthHint, drawPointsOk, drawSolverScore, isDrawColor } from './draw.js';

describe('캐치마인드', () => {
  it('점수 — 맞힌 순서 3 · 2 · 1 · 1 · 출제자 = 맞힌 수(상한 3)', () => {
    expect([0, 1, 2, 3, 7].map(drawSolverScore)).toEqual([3, 2, 1, 1, 1]);
    expect([0, 1, 2, 5].map(drawDrawerScore)).toEqual([0, 1, 2, 3]);
  });
  it('글자 수 힌트 거부 · 보통 말은 통과', () => {
    expect(drawLengthHint('3글자예요')).toBe(true);
    expect(drawLengthHint('세 글자')).toBe(true);
    expect(drawLengthHint('2음절')).toBe(true);
    expect(drawLengthHint('한자 아니에요')).toBe(false);
    expect(drawLengthHint('잘 봐요')).toBe(false);
  });
  it('점 · 색 검사', () => {
    expect(drawPointsOk([0, 0, DRAW.SIZE, 10])).toBe(true);
    expect(drawPointsOk([0, 0, 1])).toBe(false);
    expect(drawPointsOk([0, 1.5])).toBe(false);
    expect(drawPointsOk([0, DRAW.SIZE + 1])).toBe(false);
    expect(isDrawColor('erase') && isDrawColor('#111111') && !isDrawColor('#ffffff')).toBe(true);
  });
});
