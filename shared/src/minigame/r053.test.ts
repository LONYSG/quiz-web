// ★★★ R053 — 미니게임 3차 단위 검사
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MINIGAMES, decimalsFor } from '../minigame.js';
import { ODD_PAIRS } from './oddone-pairs.js';
import {
  GAUGE_PERIODS_MS,
  ODDONE_SIZES,
  gaugeOffPct,
  gaugePos,
  gaugeRounds,
  minorityResult,
  oddoneRounds,
  twoThirdsTarget,
} from './r053.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2654435761 + 7) >>> 0);

describe('★★ 목록 — 넷 · 판 수 · 최소 인원', () => {
  it('키 넷 · 판 수(5 · 3 · 5 · 5)', () => {
    const m = (k: string) => MINIGAMES.find((x) => x.key === k)!;
    expect(['minority', 'twothirds', 'oddone', 'gauge'].map((k) => m(k).rounds)).toEqual([5, 3, 5, 5]);
    expect(m('minority').minPlayers).toBe(3);
    expect(m('minority').scoring).toBe('correct');
    expect(m('minority').tiebreak).toBe('lastRank');
  });
  it('게이지 소수 최대 둘째', () => expect(decimalsFor(MINIGAMES.find((x) => x.key === 'gauge')!, [1.2341, 1.2349])).toBe(2));
});

describe('★★★ 소수파 — 가장 적게 고른 수(0명 제외)', () => {
  it('1 1 2 2 3 → 3 이 소수파', () => expect(minorityResult([1, 1, 2, 2, 3]).minority).toEqual([3]));
  it('공동 소수파', () => expect(minorityResult([1, 2, 3, 3]).minority).toEqual([1, 2]));
  it('모두 같은 수 → 없음', () => expect(minorityResult([4, 4, 4]).minority).toEqual([]));
  it('아무도 안 고름 → 없음', () => expect(minorityResult([]).minority).toEqual([]));
  it('0명은 소수파가 아니다', () => {
    const r = minorityResult([5, 5, 2]);
    expect(r.minority).toEqual([2]);
    expect(r.counts[1]).toBe(0);
  });
  it('모두 다른 수 → 전원 소수파', () => expect(minorityResult([1, 2, 3]).minority).toEqual([1, 2, 3]));
});

describe('★★ 평균의 2/3', () => {
  it('평균 · 목표', () => expect(twoThirdsTarget([30, 60, 90])).toEqual({ mean: 60, target: 40 }));
  it('아무도 → null', () => expect(twoThirdsTarget([])).toBe(null));
});

describe('★★★ 다른 하나 찾기 — 쌍 목록 · 시드 격자', () => {
  it('쌍 ≥ 24 · 쉬운 ≥ 2 · 어려운 ≥ 3', () => {
    expect(ODD_PAIRS.length).toBeGreaterThanOrEqual(24);
    expect(ODD_PAIRS.filter((p) => p.level === 'easy').length).toBeGreaterThanOrEqual(2);
    expect(ODD_PAIRS.filter((p) => p.level === 'hard').length).toBeGreaterThanOrEqual(3);
  });
  it('★ 색만 다른 쌍 0 — 모든 쌍에 모양 차이(diff)가 적혀 있고 "색" 만이 아니다', () => {
    for (const p of ODD_PAIRS) {
      expect(p.diff.length).toBeGreaterThan(1);
      expect(p.diff).not.toMatch(/^색|색만|color/i);
      expect(p.base).not.toBe(p.odd);
    }
  });
  it('겹치는 쌍 없음', () => expect(new Set(ODD_PAIRS.map((p) => [p.base, p.odd].sort().join('|'))).size).toBe(ODD_PAIRS.length));
  it('그림 파일(Twemoji SVG)이 모두 있다', () => {
    for (const p of ODD_PAIRS) for (const c of [p.base, p.odd]) expect(existsSync(path.join(ROOT, 'node_modules/@twemoji/svg', `${c}.svg`)), c).toBe(true);
  });
  it('판 — 격자 4·5·6·6·7 · 1~2판 쉬운 · 3~5판 어려운 · 정답 칸 안 · 한 판 안 쌍 겹침 없음', () => {
    for (const s of SEEDS) {
      const r = oddoneRounds(s);
      expect(r.map((x) => x.size)).toEqual([...ODDONE_SIZES]);
      const lv = (x: (typeof r)[number]) => ODD_PAIRS.find((p) => (p.base === x.pair.base && p.odd === x.pair.odd) || (p.base === x.pair.odd && p.odd === x.pair.base))!.level;
      expect(r.map(lv)).toEqual(['easy', 'easy', 'hard', 'hard', 'hard']);
      for (const x of r) {
        expect(x.oddIndex).toBeGreaterThanOrEqual(0);
        expect(x.oddIndex).toBeLessThan(x.size * x.size);
      }
      expect(new Set(r.map((x) => [x.pair.base, x.pair.odd].sort().join('|'))).size).toBe(5);
    }
  });
  it('같은 시드 = 같은 판', () => expect(oddoneRounds(5)).toEqual(oddoneRounds(5)));
});

describe('★★★ 게이지 — 위치 재계산 · 가림', () => {
  const r = { periodMs: 2000, phase0: 0 };
  it('0 → 왼쪽 끝 · 반 주기 → 오른쪽 끝 · 1/4 → 가운데', () => {
    expect(gaugePos(r, 0)).toBe(0);
    expect(gaugePos(r, 1000)).toBeCloseTo(1, 9);
    expect(gaugePos(r, 500)).toBeCloseTo(0.5, 9);
    expect(gaugePos(r, 1500)).toBeCloseTo(0.5, 9);
    expect(gaugePos(r, 2000)).toBeCloseTo(0, 9);
  });
  it('시작 위상', () => expect(gaugePos({ periodMs: 1000, phase0: 0.25 }, 0)).toBeCloseTo(0.5, 9));
  it('거리 % — 가운데 0 · 끝 100', () => {
    expect(gaugeOffPct(0.5)).toBe(0);
    expect(gaugeOffPct(0)).toBe(100);
    expect(gaugeOffPct(0.75)).toBe(50);
  });
  it('판 — 주기 2.0 · 1.6 · 1.2 · 0.9 · 0.7 · 4~5판 가림', () => {
    const g = gaugeRounds(42);
    expect(g.map((x) => x.periodMs)).toEqual([...GAUGE_PERIODS_MS]);
    expect(g.map((x) => x.hidden)).toEqual([false, false, false, true, true]);
  });
});
