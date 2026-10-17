// ★★★ R052 — 퀴즈류 미니게임 공통 단위 검사
import { describe, expect, it } from 'vitest';
import { MINIGAMES } from '../minigame.js';
import {
  QUIZ_DUMMY,
  QUIZ_SPEC,
  countryLabel,
  formatNumberInput,
  parseNumberInput,
  pctOff,
  pickQuizItems,
  priceFresh,
  ratioError,
} from './quiz.js';

describe('★★ 비율 오차 · % ', () => {
  it('정확 = 0', () => expect(ratioError(100, 100)).toBe(0));
  it('2배 = ½배 (대칭)', () => expect(ratioError(200, 100)).toBeCloseTo(ratioError(50, 100), 12));
  it('×1.2 < ×0.5', () => expect(ratioError(120, 100)).toBeLessThan(ratioError(50, 100)));
  it('0 · 음수 = Infinity', () => {
    expect(ratioError(0, 100)).toBe(Infinity);
    expect(ratioError(-5, 100)).toBe(Infinity);
  });
  it('% — 12,000 / 10,000 = +20', () => expect(pctOff(12000, 10000)).toBeCloseTo(20, 9));
});

describe('★★ 숫자 입력 — 쉼표 자동 · 읽기', () => {
  it('쉼표', () => expect(formatNumberInput('1234567', false)).toBe('1,234,567'));
  it('글자 · 소수점(정수 칸) 뺌', () => expect(formatNumberInput('12a3.4', false)).toBe('1,234'));
  it('소수 허용', () => expect(formatNumberInput('12345.678', true)).toBe('12,345.678'));
  it('앞 0 뺌', () => expect(formatNumberInput('0012', false)).toBe('12'));
  it('읽기 — 쉼표 · 단위 무시', () => expect(parseNumberInput('1,234원')).toBe(1234));
  it('읽기 — 소수', () => expect(parseNumberInput('3.5')).toBe(3.5));
  it('읽기 — 빈칸 · 0 · 점 둘 = null', () => {
    expect(parseNumberInput('')).toBe(null);
    expect(parseNumberInput('0')).toBe(null);
    expect(parseNumberInput('1.2.3')).toBe(null);
  });
});

describe('★★★ 문항 선정 — 01 12장 3단계 (모두 본 문항 제외 · 모자라면 null)', () => {
  const pool = Array.from({ length: 10 }, (_, i) => ({ id: `x-${i}` }));
  const P = ['a', 'b', 'c'];
  it('아무도 안 봤으면 5개 · 모두 1단계', () => {
    const r = pickQuizItems(pool, P, () => false, 5, 1)!;
    expect(r.items.length).toBe(5);
    expect(r.stage1).toBe(5);
    expect(new Set(r.items.map((x) => x.id)).size).toBe(5);
  });
  it('1단계 먼저 — 안 본 것 6개면 본 것은 안 나온다', () => {
    const seen = new Set(['x-0', 'x-1', 'x-2', 'x-3']);
    const r = pickQuizItems(pool, P, (a, id) => a === 'a' && seen.has(id), 5, 2)!;
    expect(r.items.every((x) => !seen.has(x.id))).toBe(true);
    expect(r.stage2).toBe(0);
  });
  it('2단계 — 본 사람이 적은 문항부터 · experiencedBy', () => {
    // x-0~7 은 a 가 봤다 · x-0~3 은 b 도 봤다 → 안 본 것 2(x-8,9) + 한 명만 본 것(x-4~7) 중 3
    const r = pickQuizItems(pool, P, (a, id) => (a === 'a' && Number(id.slice(2)) < 8) || (a === 'b' && Number(id.slice(2)) < 4), 5, 3)!;
    const ids = r.items.map((x) => x.id).sort();
    expect(ids.filter((x) => x === 'x-8' || x === 'x-9').length).toBe(2);
    expect(ids.every((x) => !['x-0', 'x-1', 'x-2', 'x-3'].includes(x))).toBe(true);
    expect(r.stage1).toBe(2);
    expect(r.stage2).toBe(3);
    for (const [, who] of r.experiencedBy) expect(who).toEqual(['a']);
  });
  it('모두 본 문항은 제외 → 모자라면 null', () => {
    const r = pickQuizItems(pool, P, (_a, id) => Number(id.slice(2)) >= 3, 5, 4);
    expect(r).toBe(null);
  });
  it('같은 시드 = 같은 선택', () => expect(pickQuizItems(pool, P, () => false, 5, 9)!.items).toEqual(pickQuizItems(pool, P, () => false, 5, 9)!.items));
});

describe('★ 얼마게요 1년 · 유로 지역 · 연습 더미 · 목록', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  it('1년 안은 낸다 · 넘으면 안 낸다', () => {
    expect(priceFresh('2026-01-01', now)).toBe(true);
    expect(priceFresh('2025-10-01', now)).toBe(false);
  });
  it('EU = 유로 지역', () => {
    expect(countryLabel('EU', '유럽연합')).toBe('유로 지역');
    expect(countryLabel('JP', '일본')).toBe('일본');
  });
  it('연습 더미는 누가 봐도 가짜 — "연습" 이 들어 있다', () => {
    for (const d of QUIZ_DUMMY.price) expect(d.name).toContain('연습');
    for (const d of QUIZ_DUMMY.estimate) expect(d.question).toContain('연습');
    for (const d of QUIZ_DUMMY.which) expect(d.stem).toContain('연습');
  });
  it('퀴즈류 다섯 — kind quiz · 문항 수 = QUIZ_SPEC', () => {
    for (const k of ['price', 'worldprice', 'photo', 'estimate', 'which'] as const) {
      const m = MINIGAMES.find((x) => x.key === k)!;
      expect(m.kind).toBe('quiz');
      expect(m.rounds).toBe(QUIZ_SPEC[k].items);
    }
    expect(MINIGAMES.find((x) => x.key === 'which')!.scoring).toBe('correct');
  });
});
