// R082 — 라이어 게임 순수 함수 · 설정 방식(mode)
import { describe, expect, it } from 'vitest';
import { LIAR, finalPasses, liarRoundScores, tallyVotes } from './liar.js';
import { validateRoomSettings } from './settings.js';

const base = { questionCount: 10 };

describe('라이어 — 투표 · 찬반 · 점수', () => {
  it('집계 — 최다 · 동률', () => {
    expect(tallyVotes(new Map([['a', 'c'], ['b', 'c'], ['c', 'a']])).top).toEqual(['c']);
    expect(tallyVotes(new Map([['a', 'c'], ['c', 'a']])).top.sort()).toEqual(['a', 'c']);
    expect(tallyVotes(new Map()).top).toEqual([]);
  });
  it('찬반 — 낼 수 있는 사람 과반', () => {
    expect(finalPasses(2, 3)).toBe(true);
    expect(finalPasses(2, 4)).toBe(false);
    expect(finalPasses(0, 0)).toBe(false);
  });
  it('점수 — 찾음(찍은 시민 +1 · 맞히면 라이어 +2) · 못 찾음 라이어 +3', () => {
    expect(Object.fromEntries(liarRoundScores({ outcome: 'caught', liar: 'L', guessOk: false, hitters: ['a', 'b'] }))).toEqual({ a: 1, b: 1 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'caught', liar: 'L', guessOk: true, hitters: ['a'] }))).toEqual({ a: 1, L: 2 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'notfound', liar: 'L', guessOk: false, hitters: ['a'] }))).toEqual({ L: 3 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'escaped', liar: 'L', guessOk: false, hitters: [] }))).toEqual({ L: 3 });
  });
});

describe('설정 — 방식(mode)', () => {
  it('없으면 퀴즈 · 옛 minigameOnly 면 미니게임', () => {
    const a = validateRoomSettings(base);
    expect(a.ok && a.settings.mode).toBe('quiz');
    const b = validateRoomSettings({ ...base, minigameOnly: true });
    expect(b.ok && [b.settings.mode, b.settings.minigameOnly]).toEqual(['minigame', true]);
  });
  it('라이어 — minigameOnly 는 false 로 맞춤 · 라운드 2~10 · 팀전과 같이 안 됨 · 모르는 값 거부', () => {
    const c = validateRoomSettings({ ...base, mode: 'liar', minigameOnly: true, minigameRounds: 5 });
    expect(c.ok && [c.settings.mode, c.settings.minigameOnly]).toEqual(['liar', false]);
    expect(validateRoomSettings({ ...base, mode: 'liar', minigameRounds: LIAR.ROUNDS.MAX + 1 }).ok).toBe(false);
    expect(validateRoomSettings({ ...base, mode: 'liar', teamMode: true }).ok).toBe(false);
    expect(validateRoomSettings({ ...base, mode: 'oops' }).ok).toBe(false);
    // ★ R083 — 캐치마인드
    const d = validateRoomSettings({ ...base, mode: 'draw', minigameRounds: 3 });
    expect(d.ok && [d.settings.mode, d.settings.minigameOnly]).toEqual(['draw', false]);
    expect(validateRoomSettings({ ...base, mode: 'draw', teamMode: true }).ok).toBe(false);
  });
});
