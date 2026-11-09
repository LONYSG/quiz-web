// R083 — 캐치마인드 순수 함수
import { describe, expect, it } from 'vitest';
import { DRAW, drawDiffPlan, drawDrawerScore, drawLengthHint, drawLengthPattern, drawPointsOk, drawSolverScore, isDrawColor } from './draw.js';

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

describe('★ R087 · R088 — 힌트 · 난이도 섞기', () => {
  it('글자 수 꼴 — ○ · 띄어쓰기 표시', () => {
    expect(drawLengthPattern('고래')).toBe('○○ · 2글자');
    expect(drawLengthPattern('라이온 킹')).toBe('○○○ ○ · 4글자(띄어쓰기 있음)');
  });
  it('diff 4 : 4 : 2 — 라운드 수만큼 · 10 이면 4 · 4 · 2 · 5 면 2 · 2 · 1', () => {
    const cnt = (a: number[]) => [1, 2, 3].map((d) => a.filter((x) => x === d).length);
    expect(cnt(drawDiffPlan(10, () => 0.3))).toEqual([4, 4, 2]);
    expect(cnt(drawDiffPlan(5, () => 0.3))).toEqual([2, 2, 1]);
    expect(drawDiffPlan(2, () => 0.3).length).toBe(2);
  });
});
