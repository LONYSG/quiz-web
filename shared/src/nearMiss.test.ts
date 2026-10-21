import { describe, expect, it } from 'vitest';
import { editDistanceWithin, nearestAnswer, NEAR_MISS_SKIP_LOGIN } from './nearMiss.js';

describe('근접 오답 (R058 · D-252)', () => {
  it('편집 거리 — 상한을 넘으면 null', () => {
    expect(editDistanceWithin('페니실린', '페니실륨', 2)).toBe(1);
    expect(editDistanceWithin('이순신', '이순신', 2)).toBe(0);
    expect(editDistanceWithin('abc', 'xyz', 2)).toBeNull();
    expect(editDistanceWithin('가', '가나다라', 2)).toBeNull();
  });

  it('포함 · 포함됨 · 거리 ≤ 2 만 가깝다', () => {
    expect(nearestAnswer('이순신이다', ['이순신'])).toEqual({ answer: '이순신', distance: 2, kind: 'contains' });
    expect(nearestAnswer('이순', ['이순신'])).toEqual({ answer: '이순신', distance: 1, kind: 'contained' });
    expect(nearestAnswer('이숭신', ['이순신'])).toEqual({ answer: '이순신', distance: 1, kind: 'edit' });
    expect(nearestAnswer('세종대왕', ['이순신'])).toBeNull();
    expect(nearestAnswer('ㅋㅋㅋㅋ', ['이순신'])).toBeNull();
  });

  it('맞은 제출 · 빈 글 · 40자 넘는 글 · 1자 제출 포함됨은 남기지 않는다', () => {
    expect(nearestAnswer('이순신', ['이순신', '충무공'])).toBeNull();
    expect(nearestAnswer('', ['이순신'])).toBeNull();
    expect(nearestAnswer('이순신'.repeat(14), ['이순신'])).toBeNull();
    expect(nearestAnswer('이', ['이순신'])).toBeNull();
  });

  it('짧은 정답 — 2자 정답은 거리 1까지 · 1자 정답은 보지 않는다', () => {
    expect(nearestAnswer('수온', ['수은'])?.distance).toBe(1);
    expect(nearestAnswer('나비', ['수은'])).toBeNull();
    expect(nearestAnswer('물고기', ['물'])).toBeNull();
  });

  it('가장 가까운 정답 · 같으면 포함이 먼저', () => {
    expect(nearestAnswer('베토벤', ['베토밴', '루트비히판베토벤'])?.answer).toBe('베토밴');
    expect(nearestAnswer('비타민cc', ['비타민c', '비타민cd'])?.kind).toBe('contains');
  });

  it('봇 · 검사 계정 제외 규칙', () => {
    const re = new RegExp(NEAR_MISS_SKIP_LOGIN, 'i');
    expect(['bot_01', 'uic3tk_fh', 'r10_a'].every((l) => re.test(l))).toBe(true);
    expect(['chanjong', 'robot'].some((l) => re.test(l))).toBe(false);
  });
});
