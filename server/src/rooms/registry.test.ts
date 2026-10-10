import { afterEach, describe, expect, it } from 'vitest';
import { createRoomObject, findRoomByCodeOrId, generateRoomId, registerRoom, resetRegistryForTest, unregisterRoom } from './registry.js';

describe('방 코드 6자리 (R043 · 건우 확정)', () => {
  afterEach(() => resetRegistryForTest());

  it('6자리 숫자 · 열린 방끼리 겹치지 않는다 · 0 으로 시작해도 된다', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 3000; i += 1) {
      const room = createRoomObject(generateRoomId(), `방${i}`, String(i));
      expect(room.code).toMatch(/^\d{6}$/);
      expect(codes.has(room.code)).toBe(false);
      codes.add(room.code);
      registerRoom(room);
    }
    // 3,000개 중 0 으로 시작하는 코드가 없을 확률은 0.9^3000 ≈ 0
    expect([...codes].some((c) => c.startsWith('0'))).toBe(true);
  });

  it('코드 · 긴 id 둘 다로 찾는다 · 방이 사라지면 코드도 풀린다', () => {
    const room = createRoomObject(generateRoomId(), '방', '1');
    registerRoom(room);
    expect(findRoomByCodeOrId(room.code)?.id).toBe(room.id);
    expect(findRoomByCodeOrId(room.id)?.id).toBe(room.id);
    unregisterRoom(room.id);
    expect(findRoomByCodeOrId(room.code)).toBeUndefined();
  });
});
