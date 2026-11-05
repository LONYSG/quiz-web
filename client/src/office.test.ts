// ★ R074 (D-322 ②) — 사무실 모드 소리: 들어가며 끄고 기억 · 나가며 되돌림
import { describe, expect, it } from 'vitest';
import { enterOfficeSound, leaveOfficeSound } from './officeSound.js';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
describe('R074 사무실 모드 소리', () => {
  it('들어가면 셋 다 끄고 전 값을 기억 · 나가면 되돌린다', () => {
    const st = mem();
    let cur = { bgmOn: true, sfxOn: true, chatOn: false };
    const set = (p: Partial<typeof cur>) => void (cur = { ...cur, ...p });
    expect(enterOfficeSound(st, () => cur, set)).toBe(true);
    expect(cur).toEqual({ bgmOn: false, sfxOn: false, chatOn: false });
    // 사무실에서 사용자가 효과음만 다시 켬
    set({ sfxOn: true });
    expect(leaveOfficeSound(st, set)).toBe(true);
    expect(cur).toEqual({ bgmOn: true, sfxOn: true, chatOn: false });
    expect(st.m.size).toBe(0);
  });
  it('이미 기억이 있으면(새로 고침 · 다시 들어옴) 덮지 않는다', () => {
    const st = mem();
    let cur = { bgmOn: true, sfxOn: true, chatOn: true };
    const set = (p: Partial<typeof cur>) => void (cur = { ...cur, ...p });
    enterOfficeSound(st, () => cur, set);
    set({ bgmOn: true });
    expect(enterOfficeSound(st, () => cur, set)).toBe(false);
    expect(cur.bgmOn).toBe(true); // 사용자가 켠 값을 다시 끄지 않음
    leaveOfficeSound(st, set);
    expect(cur).toEqual({ bgmOn: true, sfxOn: true, chatOn: true });
  });
  it('원래 다 꺼져 있었으면 안내 없음(false) · 기억 없이 나가면 그대로', () => {
    const st = mem();
    let cur = { bgmOn: false, sfxOn: false, chatOn: false };
    const set = (p: Partial<typeof cur>) => void (cur = { ...cur, ...p });
    expect(enterOfficeSound(st, () => cur, set)).toBe(false);
    expect(leaveOfficeSound(mem(), set)).toBe(false);
  });
});
