// R083 — 캐치마인드 순수 함수
import { describe, expect, it } from 'vitest';
import { DRAW, floodFill, gridHash, hexToRgb, drawDiffPlan, drawDrawerScore, drawLengthHint, drawLengthPattern, drawPointsOk, drawSolverScore, isDrawColor } from './draw.js';

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
    // ★ R089 — 세부 색 · 스포이드: '#rrggbb' 아무거나
    expect(isDrawColor('erase') && isDrawColor('#111111') && isDrawColor('#ffffff') && !isDrawColor('#fff') && !isDrawColor('red')).toBe(true);
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

describe('★ R089 — 페인트통(영역 채우기) · 해시', () => {
  /** 흰 바탕 w×h + 가운데 세로 검은 줄(벽) */
  const board = (w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < h; y += 1) {
      const i = (y * w + Math.floor(w / 2)) * 4;
      d[i] = d[i + 1] = d[i + 2] = 17;
    }
    return d;
  };
  it('벽 왼쪽만 칠한다 · 같은 색이면 0 · 같은 입력이면 같은 해시', () => {
    const a = board(20, 10);
    expect(floodFill(a, 20, 10, 2, 2, hexToRgb('#e5383b'))).toBe(10 * 10);
    expect(floodFill(a, 20, 10, 2, 2, hexToRgb('#e5383b'))).toBe(0);
    const b = board(20, 10);
    floodFill(b, 20, 10, 5, 7, hexToRgb('#e5383b'));
    expect(gridHash(a)).toBe(gridHash(b));
  });
  it('1000×1000 흰 판 전체 ≤ 300ms(검사 기계 여유)', () => {
    const d = new Uint8ClampedArray(1000 * 1000 * 4).fill(255);
    const t = performance.now();
    expect(floodFill(d, 1000, 1000, 500, 500, hexToRgb('#2563eb'))).toBe(1_000_000);
    expect(performance.now() - t).toBeLessThan(300);
  });
});
