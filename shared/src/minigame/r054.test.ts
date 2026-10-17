// ★★ R054 — 업적 정의 · 풍선 · 연타 단위 검사
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementDef } from '../achievements.js';
import { MINIGAMES } from '../minigame.js';
import { GAME_TOPICS } from '../settings.js';
import { BALLOON_BURST_MAX, BALLOON_BURST_MIN, BALLOON_ROUNDS, balloonBursts, balloonSize } from './r054.js';

describe('★★ 업적 정의', () => {
  it('키 겹침 없음 · 이름 · 조건 글', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.desc.length).toBeGreaterThan(0);
    }
  });
  it('분야 7 × 2 · 연속 3 · 5 · 10 · 1위 1 · 10 · 기록 넷 · 테마', () => {
    expect(ACHIEVEMENTS.filter((a) => a.group === 'topic').length).toBe(GAME_TOPICS.length * 2);
    for (const k of ['first-correct', 'streak-3', 'streak-5', 'streak-10', 'mg-win-1', 'mg-win-10', 'cake-50ms', 'circle-95', 'reaction-200', 'typing-10s', 'theme-chiikawa'])
      expect(ACHIEVEMENTS.some((a) => a.key === k), k).toBe(true);
  });
  it('모르는 테마 키도 이름이 나온다', () => expect(achievementDef('theme-new').name).toBe('테마 완성'));
});

describe('★★★ 풍선 불기', () => {
  it('초당 +10% · 1초 = 110 · 10초 = 200', () => {
    expect(balloonSize(0)).toBe(100);
    expect(balloonSize(1000)).toBe(110);
    expect(balloonSize(10_000)).toBe(200);
  });
  it('터지는 크기 — 판 3 · 120~300 · 같은 시드 같은 값', () => {
    for (let s = 1; s < 300; s += 7) {
      const b = balloonBursts(s);
      expect(b.length).toBe(BALLOON_ROUNDS);
      for (const x of b) {
        expect(x).toBeGreaterThanOrEqual(BALLOON_BURST_MIN);
        expect(x).toBeLessThanOrEqual(BALLOON_BURST_MAX);
      }
      expect(balloonBursts(s)).toEqual(b);
    }
  });
});

describe('★ 목록 — 풍선 · 연타', () => {
  it('3판 · 크게가 좋다', () => {
    for (const k of ['balloon', 'tap']) {
      const m = MINIGAMES.find((x) => x.key === k)!;
      expect(m.rounds).toBe(3);
      expect(m.better).toBe('high');
    }
  });
});
