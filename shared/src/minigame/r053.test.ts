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
  minorityChoiceCount,
  minorityChoices,
  minorityLine,
  minorityResult,
  oddoneRounds,
} from './r053.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2654435761 + 7) >>> 0);

describe('★★ 목록 — 셋(R060 twothirds 삭제) · 판 수 · 최소 인원', () => {
  it('키 셋 · 판 수(5 · 5 · 5) · twothirds 없음', () => {
    const m = (k: string) => MINIGAMES.find((x) => x.key === k)!;
    expect(['minority', 'oddone', 'gauge'].map((k) => m(k).rounds)).toEqual([5, 5, 5]);
    expect(MINIGAMES.some((x) => (x.key as string) === 'twothirds')).toBe(false);
    expect(m('minority').minPlayers).toBe(3);
    expect(m('minority').scoring).toBe('correct');
    expect(m('minority').tiebreak).toBe('none'); // ★ R060 — 동점은 공동 순위
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

describe('★★★ R077 소수파 선택지 = 인원 − 1 (2~5 · D-327)', () => {
  it('n 계산 — 2 · 3 · 4 · 5 · 6 · 10명', () => {
    expect([2, 3, 4, 5, 6, 10].map(minorityChoiceCount)).toEqual([2, 2, 3, 4, 5, 5]);
    expect(minorityChoiceCount(1)).toBe(2); // 연습 1명도 둘
    expect(minorityChoices(4)).toEqual([1, 2, 3]);
  });
  it('n=2 · 3명 1·1·2 → 소수파 [2] · counts 는 1~2 만', () => {
    const r = minorityResult([1, 1, 2], 2);
    expect(r.minority).toEqual([2]);
    expect(Object.keys(r.counts)).toEqual(['1', '2']);
  });
  it('n=2 에서 3 은 세지 않는다', () => expect(minorityResult([3, 1, 1], 2).counts).toEqual({ 1: 2, 2: 0 }));
  it('n < 인원 → 모두 다른 수는 불가능(비둘기집)', () => {
    for (const p of [3, 4, 5, 6]) expect(minorityChoiceCount(p)).toBeLessThan(p);
  });
  it('판 화면 줄', () => expect(minorityLine(3)).toMatch(/^1~3 중 하나/));
  it('카탈로그 설명 — 인원보다 하나 적은', () => expect(MINIGAMES.find((x) => x.key === 'minority')!.oneLine).toMatch(/인원보다 하나 적은/));
});


describe('★★★ 다른 하나 찾기 — 쌍 목록 · 시드 격자', () => {
  it('쌍 ≥ 24 · 쉬운 ≥ 2 · ★ R071 어려운 ≥ 25 (D-315)', () => {
    expect(ODD_PAIRS.length).toBeGreaterThanOrEqual(24);
    expect(ODD_PAIRS.filter((p) => p.level === 'easy').length).toBeGreaterThanOrEqual(2);
    expect(ODD_PAIRS.filter((p) => p.level === 'hard').length).toBeGreaterThanOrEqual(25);
  });
  it('★ R071 — 더한 쌍(hard 16번째부터)의 그림은 다른 어느 쌍에도 안 쓰인다', () => {
    const hard = ODD_PAIRS.filter((p) => p.level === 'hard');
    const added = hard.slice(15);
    expect(added.length).toBeGreaterThanOrEqual(10);
    const count = new Map<string, number>();
    for (const p of ODD_PAIRS) for (const c of [p.base, p.odd]) count.set(c, (count.get(c) ?? 0) + 1);
    for (const p of added) for (const c of [p.base, p.odd]) expect(count.get(c), c).toBe(1);
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
  it('★ R071 판 — 격자 4·5·6·7·8 · 1판만 쉬운 · 2~5판 어려운 · 정답 칸 안 · 한 판 안 쌍 겹침 없음', () => {
    expect([...ODDONE_SIZES]).toEqual([4, 5, 6, 7, 8]);
    for (const s of SEEDS) {
      const r = oddoneRounds(s);
      expect(r.map((x) => x.size)).toEqual([...ODDONE_SIZES]);
      const lv = (x: (typeof r)[number]) => ODD_PAIRS.find((p) => (p.base === x.pair.base && p.odd === x.pair.odd) || (p.base === x.pair.odd && p.odd === x.pair.base))!.level;
      expect(r.map(lv)).toEqual(['easy', 'hard', 'hard', 'hard', 'hard']);
      for (const x of r) {
        expect(x.oddIndex).toBeGreaterThanOrEqual(0);
        expect(x.oddIndex).toBeLessThan(x.size * x.size);
      }
      expect(new Set(r.map((x) => [x.pair.base, x.pair.odd].sort().join('|'))).size).toBe(5);
    }
  });
  it('같은 시드 = 같은 판', () => expect(oddoneRounds(5)).toEqual(oddoneRounds(5)));
  it('★ R071 — 어려운 쌍이 고르게 나온다(시드 2,000 · 28쌍 모두 한 번 이상 · 어려운 판 비율 4/5)', () => {
    const seen = new Set<string>();
    let hardRounds = 0;
    let all = 0;
    for (let s = 1; s <= 2000; s += 1) {
      for (const x of oddoneRounds(s)) {
        const p = ODD_PAIRS.find((q) => (q.base === x.pair.base && q.odd === x.pair.odd) || (q.base === x.pair.odd && q.odd === x.pair.base))!;
        all += 1;
        if (p.level === 'hard') {
          hardRounds += 1;
          seen.add(p.base + p.odd);
        }
      }
    }
    expect(seen.size).toBe(ODD_PAIRS.filter((p) => p.level === 'hard').length);
    expect(hardRounds / all).toBe(0.8);
  });
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
