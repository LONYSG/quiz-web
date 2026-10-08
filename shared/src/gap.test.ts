import { describe, expect, it } from 'vitest';
import { formatGapNs, formatGapNsString, formatGapSeconds } from './gap.js';

describe('★★ 뒷북 시간 차 표기 (R038 건우 확정 규칙)', () => {
  it('건우 예시 1 — 0.0000345866초 → 0.0000346', () => {
    expect(formatGapNs(34_587n)).toBe('0.0000346'); // 0.000034587 → 0.0000346 (반올림)
    expect(formatGapSeconds(0.0000345866)).toBe('0.0000346');
  });
  it('건우 예시 2 — 0.0135426초 → 0.0135', () => {
    expect(formatGapSeconds(0.0135426)).toBe('0.0135');
  });
  it('반올림 (올림 쪽)', () => {
    expect(formatGapSeconds(0.0135526)).toBe('0.0136');
    expect(formatGapSeconds(0.123456)).toBe('0.123');
  });
  it('1초 이상 — 소수 부분에 같은 규칙', () => {
    expect(formatGapSeconds(1.2345)).toBe('1.235');
    expect(formatGapSeconds(2.0512)).toBe('2.0512');
    expect(formatGapSeconds(2.05126)).toBe('2.0513');
    expect(formatGapSeconds(2)).toBe('2');
  });
  it('자리 올림 — 첫 0 아닌 자리가 앞으로 옮겨지면 다시 맞춘다', () => {
    expect(formatGapSeconds(0.09996)).toBe('0.100');
    expect(formatGapSeconds(0.0999)).toBe('0.0999');
    expect(formatGapSeconds(0.0009996)).toBe('0.00100');
  });
  it('자리 올림이 정수로 넘어간다', () => {
    expect(formatGapSeconds(0.9996)).toBe('1.00');
    expect(formatGapSeconds(1.9996)).toBe('2.00');
  });
  it('부동소수 오차 — 0.1 + 0.2', () => {
    expect(formatGapSeconds(0.1 + 0.2)).toBe('0.300');
    expect(formatGapSeconds(0.3)).toBe('0.300');
  });
  it('나노초 한 자리 · 0 · 문자열 입력', () => {
    expect(formatGapNs(1n)).toBe('0.000000001');
    expect(formatGapNs(0n)).toBe('0');
    expect(formatGapNsString('13542600')).toBe('0.0135');
    expect(formatGapNsString('x')).toBe('?');
  });
});
