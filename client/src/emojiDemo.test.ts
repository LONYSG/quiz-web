// ★ R074 (D-321 가) — 😊 자동 시연 상태 기계
import { describe, expect, it } from 'vitest';
import { DEMO_MS, demoMarksSeen, demoNext, demoPoint, demoVisible, type DemoState } from './emojiDemo.js';

describe('R074 시연 상태 기계', () => {
  it('처음 열면 armed → start → playing → finish → done', () => {
    let s: DemoState = 'idle';
    s = demoNext(s, { type: 'open', wanted: true });
    expect(s).toBe('armed');
    s = demoNext(s, { type: 'start' });
    expect(s).toBe('playing');
    expect(demoVisible(s)).toBe(true);
    s = demoNext(s, { type: 'finish' });
    expect(s).toBe('done');
    expect(demoVisible(s)).toBe(false);
  });
  it('본 계정(wanted false)은 열어도 idle', () => {
    expect(demoNext('idle', { type: 'open', wanted: false })).toBe('idle');
    expect(demoNext('idle', { type: 'start' })).toBe('idle');
  });
  it('사용자가 누르면 바로 멈춘다(armed · playing → done) · done 에선 그대로', () => {
    expect(demoNext('armed', { type: 'interrupt' })).toBe('done');
    expect(demoNext('playing', { type: 'interrupt' })).toBe('done');
    expect(demoNext('done', { type: 'interrupt' })).toBe('done');
    expect(demoNext('idle', { type: 'interrupt' })).toBe('idle');
  });
  it('[시연 보기] = 언제든 다시 armed · 닫으면 idle', () => {
    expect(demoNext('done', { type: 'replay' })).toBe('armed');
    expect(demoNext('idle', { type: 'replay' })).toBe('armed');
    expect(demoNext('playing', { type: 'close' })).toBe('idle');
  });
  it('봤다(emojiDemoSeen)는 실제로 시작한 순간 한 번만', () => {
    expect(demoMarksSeen('armed', 'playing')).toBe(true);
    expect(demoMarksSeen('playing', 'done')).toBe(false);
    expect(demoMarksSeen('armed', 'done')).toBe(false); // 시작 전에 누르면 안 본 것
    expect(demoMarksSeen('idle', 'armed')).toBe(false);
  });
  it('3초 · 길: 처음 = 목록 칸 · 끝 = 1번 자리 · 가운데는 위로 볼록', () => {
    expect(DEMO_MS).toBe(3000);
    const a = { x: 100, y: 300 };
    const b = { x: 40, y: 120 };
    expect(demoPoint(a, b, 0)).toMatchObject({ x: 100, y: 300, scale: 1 });
    expect(demoPoint(a, b, 1)).toMatchObject({ x: 40, y: 120, scale: 1 });
    const mid = demoPoint(a, b, 0.475);
    expect(mid.y).toBeLessThan((a.y + b.y) / 2); // 볼록
    expect(demoPoint(a, b, 2)).toMatchObject({ x: 40, y: 120 });
  });
});
