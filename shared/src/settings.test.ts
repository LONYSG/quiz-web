// =============================================================================
// 게임 설정 검증 테스트
//
// ★ 경계값을 반드시 양쪽으로 잡는다. Q-10(1~200) / Q-11(3~60)의 경계에서
//   "하나 차이" 로 틀리는 것이 가장 흔한 실수다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { formatExperienceRate, validateRoomSettings } from './settings.js';

const base = { questionCount: 20, startMode: 'instant' as const, countdownSec: 5 };

describe('validateRoomSettings — 문제 수 (Q-10: 1~200)', () => {
  it.each([1, 2, 50, 100, 199, 200])('%i 은 통과한다', (questionCount) => {
    const r = validateRoomSettings({ ...base, questionCount });
    expect(r.ok).toBe(true);
  });

  it.each([0, -1, 201, 1000])('%i 은 거부한다', (questionCount) => {
    const r = validateRoomSettings({ ...base, questionCount });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('questionCount');
  });

  it('소수점은 거부한다 — 조용히 반올림하지 않는다', () => {
    const r = validateRoomSettings({ ...base, questionCount: 10.5 });
    expect(r.ok).toBe(false);
  });

  it('문자열 숫자는 거부한다', () => {
    const r = validateRoomSettings({ ...base, questionCount: '20' });
    expect(r.ok).toBe(false);
  });

  it('NaN 은 거부한다 — 빈 입력창이 NaN 으로 오는 경로가 있다', () => {
    const r = validateRoomSettings({ ...base, questionCount: Number.NaN });
    expect(r.ok).toBe(false);
  });
});

describe('validateRoomSettings — 카운트다운 초 (Q-11: 3~60)', () => {
  it.each([3, 4, 30, 59, 60])('%i 은 통과한다', (countdownSec) => {
    expect(validateRoomSettings({ ...base, countdownSec }).ok).toBe(true);
  });

  it.each([0, 1, 2, 61, 300])('%i 은 거부한다', (countdownSec) => {
    const r = validateRoomSettings({ ...base, countdownSec });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('countdownSec');
  });

  it('★ 즉시 시작이어도 카운트다운 초를 검증한다', () => {
    const r = validateRoomSettings({ ...base, startMode: 'instant', countdownSec: 1 });
    expect(r.ok).toBe(false);
  });
});

describe('validateRoomSettings — 시작 방식', () => {
  it('instant / countdown 만 허용한다', () => {
    expect(validateRoomSettings({ ...base, startMode: 'instant' }).ok).toBe(true);
    expect(validateRoomSettings({ ...base, startMode: 'countdown' }).ok).toBe(true);
    const r = validateRoomSettings({ ...base, startMode: 'INSTANT' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('startMode');
  });
});

describe('validateRoomSettings — 형식 방어', () => {
  it.each([null, undefined, 42, 'x', []])('%s 는 거부한다', (input) => {
    expect(validateRoomSettings(input).ok).toBe(false);
  });

  it('통과하면 알려진 필드만 남긴다 — 프로토타입 오염 방어', () => {
    const r = validateRoomSettings({ ...base, extra: 'x', __proto__: { evil: 1 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.settings).sort()).toEqual([
      'countdownSec',
      'questionCount',
      'startMode',
    ]);
  });
});

describe('formatExperienceRate (guide 6절 표기 규칙)', () => {
  it('백분율과 절대 개수를 함께 보여준다', () => {
    expect(formatExperienceRate(153, 1234)).toBe('1,234문제 중 153문제 (12.4%)');
  });

  it('경험 기록이 없으면 0.0%', () => {
    expect(formatExperienceRate(0, 53)).toBe('53문제 중 0문제 (0.0%)');
  });

  it('전부 경험했으면 100.0%', () => {
    expect(formatExperienceRate(53, 53)).toBe('53문제 중 53문제 (100.0%)');
  });

  it('★ 분모가 0이면 0으로 나누지 않는다', () => {
    expect(formatExperienceRate(0, 0)).toBe('출제 가능한 문제가 없습니다');
    expect(formatExperienceRate(0, 0)).not.toContain('NaN');
  });
});
