import { describe, expect, it } from 'vitest';
import { GONGBANG } from '@quiz/shared';
import { checkRoomPassword, parseCreateExtras } from './index.js';
import type { Room } from '../rooms/types.js';

const room = (password: string | null) => ({ password, passwordFails: new Map() }) as unknown as Room;

describe('공방 잠금 — 숫자 4자리 · 5번 틀리면 10분 (R116 · docs/24 3-3)', () => {
  it('비밀번호가 없으면 통과 · 있는데 안 보내면 ROOM_LOCKED', () => {
    expect(checkRoomPassword(room(null), 'a', undefined).ok).toBe(true);
    expect(checkRoomPassword(room('1234'), 'a', undefined)).toEqual({ ok: false, code: 'ROOM_LOCKED' });
  });
  it('맞으면 통과 · 틀리면 남은 횟수 · 5번째에 잠김 · 잠긴 동안은 맞아도 못 들어감 · 10분 뒤 풀림', () => {
    const r = room('1234');
    const t0 = 1_000_000;
    expect(checkRoomPassword(r, 'b', '1234', t0).ok).toBe(true);
    for (let i = 1; i <= 4; i += 1) expect(checkRoomPassword(r, 'a', '0000', t0 + i)).toEqual({ ok: false, code: 'WRONG_PASSWORD', left: GONGBANG.PASSWORD_FAIL_MAX - i });
    const fifth = checkRoomPassword(r, 'a', '0000', t0 + 5);
    expect(fifth.ok).toBe(false);
    expect(!fifth.ok && fifth.code).toBe('PASSWORD_LOCKED');
    expect(checkRoomPassword(r, 'a', '1234', t0 + 6).ok).toBe(false);
    // 다른 사람은 상관없다
    expect(checkRoomPassword(r, 'c', '1234', t0 + 7).ok).toBe(true);
    expect(checkRoomPassword(r, 'a', '1234', t0 + 5 + GONGBANG.PASSWORD_LOCK_MS + 61_000).ok).toBe(true);
  });
});

describe('방 만들기 새 칸 (옛 화면은 제목만 보내도 기본)', () => {
  it('기본 = 퀴즈 · 정원 8 · 열린 방', () => {
    expect(parseCreateExtras({})).toEqual({ kind: 'quiz', maxPlayers: 8, password: null });
  });
  it('라이어는 3명부터 · 비밀번호 숫자 4자리만', () => {
    expect(parseCreateExtras({ kind: 'liar', maxPlayers: 3, password: '0042' })).toEqual({ kind: 'liar', maxPlayers: 3, password: '0042' });
    expect(parseCreateExtras({ kind: 'liar', maxPlayers: 2 })).toBeNull();
    expect(parseCreateExtras({ kind: 'quiz', password: '12a4' })).toBeNull();
    expect(parseCreateExtras({ kind: 'chess' })).toBeNull();
    expect(parseCreateExtras({ kind: 'draw', maxPlayers: 11 })).toBeNull();
  });
});
