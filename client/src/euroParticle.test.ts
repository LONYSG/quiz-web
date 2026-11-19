// ★ R105 — "덕아웃"으로 · "와이파이"로
import { describe, expect, it } from 'vitest';
import { euroParticle } from './josa.js';

describe('euroParticle', () => {
  it('한글 받침', () => {
    expect(euroParticle('덕아웃')).toBe('으로');
    expect(euroParticle('와이파이')).toBe('로');
    expect(euroParticle('서울')).toBe('로'); // ㄹ 받침
  });
  it('한글이 아니면 소리로 어림', () => {
    expect(euroParticle('BTS')).toBe('로');
    expect(euroParticle('ICBM')).toBe('으로');
    expect(euroParticle('2010')).toBe('으로');
    expect(euroParticle('1987')).toBe('로');
  });
});
