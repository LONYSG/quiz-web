import { describe, expect, it } from 'vitest';
import { POINTS_SQL, pointsFromRow } from './points.js';

describe('포인트 — 넷 합 (R059 · D-254)', () => {
  it('잔액 = 맞힌 문제 + 미니게임 보상 + 지급 − 쓴 것', () => {
    expect(pointsFromRow({ correct: '31', rewards: '16', grants: '70', spent: '20' })).toEqual({ earned: 117, correct: 31, rewards: 16, grants: 70, spent: 20, balance: 97 });
  });
  it('이관 — 보상 70 이 지급 70 으로 옮겨도 잔액은 같다(123qwe 97)', () => {
    const before = pointsFromRow({ correct: '31', rewards: '86', grants: '0', spent: '20' }).balance;
    const after = pointsFromRow({ correct: '31', rewards: '16', grants: '70', spent: '20' }).balance;
    expect([before, after]).toEqual([97, 97]);
  });
  it('지급 칸이 없던 옛 행도 0 으로', () => {
    expect(pointsFromRow({ correct: '3', rewards: '2', spent: '1' }).balance).toBe(4);
  });
  it('식이 point_grants 를 읽는다', () => expect(POINTS_SQL).toMatch(/point_grants/));
});
