// ★★ R050 — 미니게임 공통 규칙 · 균형의수호자 넓이 계산 단위 검사
import { describe, expect, it } from 'vitest';
import {
  decimalsForRanking,
  formatMinigameValue,
  minigameReward,
  minigameSlots,
  rankFinal,
  rankRound,
} from './minigame.js';
import { balanceItem, balanceSplit, BALANCE_BOTTOM_Y, BALANCE_TOP_Y, clipHalfPlane, polygonArea, type Pt } from './balance.js';

describe('등장 자리 — 10문제마다 · 마지막 뒤 없음 · 5~9 가운데 · 4 이하 없음', () => {
  it.each([
    [4, []],
    [5, [3]],
    [9, [5]],
    [10, [5]],
    [11, [10]],
    [20, [10]],
    [21, [10, 20]],
    [200, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]],
  ])('%i문제 → %j', (n, want) => {
    expect(minigameSlots(n)).toEqual(want);
  });
});

describe('보상 — 2명 · 3~4명 · 5명+ · 공동 · 혼자', () => {
  it('2명', () => expect([1, 2].map((r) => minigameReward(r, 2))).toEqual([2, 0]));
  it('3~4명', () => expect([1, 2, 3, 4].map((r) => minigameReward(r, 4))).toEqual([3, 1, 0, 0]));
  it('5명+', () => expect([1, 2, 3, 4].map((r) => minigameReward(r, 6))).toEqual([3, 2, 1, 0]));
  it('공동 1위는 같은 점수', () => expect([minigameReward(1, 5), minigameReward(1, 5)]).toEqual([3, 3]));
  it('혼자는 0', () => expect(minigameReward(1, 1)).toBe(0));
});

describe('판 순위', () => {
  it('작을수록 좋음 · 공동 · 미제출 꼴찌(0점)', () => {
    const r = rankRound(
      [
        { accountId: 'a', value: 0.2 },
        { accountId: 'b', value: 0.05 },
        { accountId: 'c', value: null },
        { accountId: 'd', value: 0.2 },
      ],
      'low',
    );
    expect(r.map((x) => [x.accountId, x.rank, x.points])).toEqual([
      ['b', 1, 4],
      ['a', 2, 3],
      ['d', 2, 3],
      ['c', 4, 0],
    ]);
  });
  it('클수록 좋음', () => {
    const r = rankRound(
      [
        { accountId: 'a', value: 49.9 },
        { accountId: 'b', value: 50 },
      ],
      'high',
    );
    expect(r[0]!.accountId).toBe('b');
  });
  it('최종 — 합 · 같으면 마지막 판 순위 · 그래도 같으면 공동', () => {
    const f = rankFinal([
      { accountId: 'a', total: 7, lastRoundRank: 2 },
      { accountId: 'b', total: 7, lastRoundRank: 1 },
      { accountId: 'c', total: 5, lastRoundRank: 1 },
      { accountId: 'd', total: 5, lastRoundRank: 1 },
    ]);
    expect(f.map((x) => [x.accountId, x.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 3],
      ['d', 3],
    ]);
  });
});

describe('★★ 소수 표시 — 1위와 2위가 갈리는 자리까지 (최소 1 · 최대 3)', () => {
  it('큰 차이 → 첫째 자리', () => expect(decimalsForRanking([0.12, 0.84])).toBe(1));
  it('접전 → 둘째', () => expect(decimalsForRanking([49.87, 49.86])).toBe(2));
  it('첫째 자리에서 갈리면 첫째 (49.87 · 49.81)', () => expect(decimalsForRanking([49.87, 49.81])).toBe(1));
  it('더 접전 → 셋째', () => expect(decimalsForRanking([0.0412, 0.0438])).toBe(3));
  it('셋째로도 안 갈리면 셋째', () => expect(decimalsForRanking([0.04121, 0.04124])).toBe(3));
  it('공동 1위 → 첫째', () => expect(decimalsForRanking([0.3, 0.3])).toBe(1));
  it('한 명 → 첫째', () => expect(decimalsForRanking([0.3])).toBe(1));
  it('부호 표시', () => {
    expect(formatMinigameValue(-0.1234, 3, true)).toBe('−0.123');
    expect(formatMinigameValue(0.045, 2, true)).toBe('+0.05');
    expect(formatMinigameValue(0, 2, true)).toBe('±0.00');
  });
});

describe('★★ 넓이 나누기 — 해석값과 일치', () => {
  const sq: Pt[] = [
    { x: 20, y: 20 },
    { x: 80, y: 20 },
    { x: 80, y: 80 },
    { x: 20, y: 80 },
  ];
  it('다각형 넓이', () => expect(polygonArea(sq)).toBeCloseTo(3600, 9));
  it('사각형 — 가운데 수직선 50:50', () => {
    const s = balanceSplit({ outer: sq, holes: [] }, { top: 50, bottom: 50 });
    expect(s.aPct).toBeCloseTo(50, 9);
    expect(s.smallPct).toBeCloseTo(50, 9);
  });
  it('사각형 — x=35 수직선 25:75', () => {
    const s = balanceSplit({ outer: sq, holes: [] }, { top: 35, bottom: 35 });
    expect(s.smallPct).toBeCloseTo(25, 9);
  });
  it('사각형 — 대각선(위 20 → 아래 80 연장선)', () => {
    // 선: (20,6) → (80,94). 정사각형과 만나는 곳을 해석적으로: x = 20 + (y−6)·60/88
    const x = (y: number) => 20 + ((y - BALANCE_TOP_Y) * 60) / (BALANCE_BOTTOM_Y - BALANCE_TOP_Y);
    // 왼쪽 아래 사다리꼴 넓이 = ∫(x(y) − 20)dy, y 20..80
    const leftArea = ((x(20) - 20 + (x(80) - 20)) / 2) * 60;
    const s = balanceSplit({ outer: sq, holes: [] }, { top: 20, bottom: 80 });
    expect(Math.min(leftArea, 3600 - leftArea) / 36).toBeCloseTo(s.smallPct, 9);
  });
  it('삼각형 — 꼭짓점을 지나는 중선 50:50', () => {
    const tri: Pt[] = [
      { x: 50, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];
    // 꼭짓점 (50,10) 과 밑변 가운데 (50,90) 를 지나는 수직선
    const s = balanceSplit({ outer: tri, holes: [] }, { top: 50, bottom: 50 });
    expect(s.smallPct).toBeCloseTo(50, 9);
  });
  it('구멍 있는 모양 — 가운데에서 벗어난 구멍', () => {
    const hole: Pt[] = [
      { x: 55, y: 40 },
      { x: 75, y: 40 },
      { x: 75, y: 60 },
      { x: 55, y: 60 },
    ];
    // 바깥 3600 − 구멍 400 = 3200. x=50 선의 왼쪽 = 30×60 = 1800, 오른쪽 = 1800 − 400 = 1400 → 작은 쪽 43.75%
    const s = balanceSplit({ outer: sq, holes: [hole] }, { top: 50, bottom: 50 });
    expect(s.smallPct).toBeCloseTo(43.75, 9);
  });
  it('오목한 다각형도 반평면 자르기 넓이가 정확하다 (ㄷ자)', () => {
    const c: Pt[] = [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 60 },
      { x: 80, y: 60 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ];
    // 넓이 3600 − 40×20 = 2800. x=60 오른쪽 = 20×20×2 = 800
    const right = polygonArea(clipHalfPlane(c, { x: 60, y: 6 }, { x: 60, y: 94 }, false));
    const left = polygonArea(clipHalfPlane(c, { x: 60, y: 6 }, { x: 60, y: 94 }, true));
    expect(Math.min(left, right)).toBeCloseTo(800, 9);
    expect(left + right).toBeCloseTo(2800, 9);
  });
  it('물건 — 같은 시드면 같은 모양 · 넓이 > 0 · 상자 안', () => {
    for (const kind of ['steak', 'pizza', 'cake', 'donut'] as const) {
      const a = balanceItem(kind, 1234);
      const b = balanceItem(kind, 1234);
      expect(a.outer).toEqual(b.outer);
      expect(polygonArea(a.outer)).toBeGreaterThan(500);
      for (const p of a.outer) {
        expect(p.x).toBeGreaterThanOrEqual(9.99);
        expect(p.x).toBeLessThanOrEqual(90.01);
        expect(p.y).toBeGreaterThanOrEqual(15.99);
        expect(p.y).toBeLessThanOrEqual(84.01);
      }
    }
    expect(balanceItem('donut', 7).holes.length).toBe(1);
  });
});
