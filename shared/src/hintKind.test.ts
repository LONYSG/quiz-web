// ★ R094 (D-351 · #124) — 숫자뿐인 초성 힌트에 "숫자 n자리" 표시
import { describe, expect, it } from 'vitest';
import { generateHint, hintKind } from './hint.js';

describe('hintKind — 숫자뿐인 힌트', () => {
  it('연도 · 숫자 정답 → 숫자 n자리', () => {
    expect(hintKind(generateHint('1988'))).toEqual({ kind: 'number', digits: 4, label: '숫자 4자리' });
    expect(hintKind(generateHint('119'))?.label).toBe('숫자 3자리');
    expect(hintKind('__')?.label).toBe('숫자 2자리');
  });
  it('숫자 + 기호 · 띄어쓰기 → 숫자 n개', () => {
    expect(generateHint('-40')).toBe('-__');
    expect(hintKind(generateHint('-40'))?.label).toBe('숫자 2개');
    expect(hintKind(generateHint('3.14'))?.label).toBe('숫자 3개');
    expect(hintKind(generateHint('1/2'))?.label).toBe('숫자 2개');
    expect(hintKind('__ __')?.label).toBe('숫자 4개');
  });
  it('글자가 하나라도 보이면 그대로(null)', () => {
    expect(hintKind(generateHint('New York'))).toBeNull(); // N__ Y___
    expect(hintKind(generateHint('3개'))).toBeNull(); // _ㄱ
    expect(hintKind(generateHint('iPhone 15'))).toBeNull(); // i_____ __
    expect(hintKind(generateHint('아수라장'))).toBeNull();
    expect(hintKind(generateHint('7'))).toBeNull(); // 힌트 없음
    expect(hintKind(null)).toBeNull();
    expect(hintKind('')).toBeNull();
    expect(hintKind('-')).toBeNull();
  });
});
