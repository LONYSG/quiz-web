// R082 — 라이어 게임 순수 함수 · 설정 방식(mode)
import { describe, expect, it } from 'vitest';
import { LIAR, LIAR_STEPS, appealPasses, canAppeal, discussNeed, finalPasses, liarRoundScores, liarStep, tallyVotes } from './liar.js';
import { validateRoomSettings } from './settings.js';

const base = { questionCount: 10 };

describe('라이어 — 투표 · 찬반 · 점수', () => {
  it('집계 — 최다 · 동률', () => {
    expect(tallyVotes(new Map([['a', 'c'], ['b', 'c'], ['c', 'a']])).top).toEqual(['c']);
    expect(tallyVotes(new Map([['a', 'c'], ['c', 'a']])).top.sort()).toEqual(['a', 'c']);
    expect(tallyVotes(new Map()).top).toEqual([]);
  });
  it('찬반 — 낼 수 있는 사람 과반', () => {
    expect(finalPasses(2, 1)).toBe(true);
    expect(finalPasses(2, 2)).toBe(false); // ★ R087 — 동률이면 산다
    expect(finalPasses(1, 2)).toBe(false);
    expect(finalPasses(0, 0)).toBe(false);
  });
  it('점수 — 찾음(찍은 시민 +1 · 맞히면 라이어 +2) · 못 찾음 라이어 +3', () => {
    expect(Object.fromEntries(liarRoundScores({ outcome: 'caught', liar: 'L', guessOk: false, hitters: ['a', 'b'] }))).toEqual({ a: 1, b: 1 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'caught', liar: 'L', guessOk: true, hitters: ['a'] }))).toEqual({ a: 1, L: 2 });
    // ★ R088 — 바보형은 들킨 뒤 맞히기 +1 · 안 들킴 +3 은 같음
    expect(Object.fromEntries(liarRoundScores({ outcome: 'caught', liar: 'L', guessOk: true, hitters: ['a'], mode: 'fool' }))).toEqual({ a: 1, L: 1 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'notfound', liar: 'L', guessOk: false, hitters: [], mode: 'fool' }))).toEqual({ L: 3 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'notfound', liar: 'L', guessOk: false, hitters: ['a'] }))).toEqual({ L: 3 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'escaped', liar: 'L', guessOk: false, hitters: [] }))).toEqual({ L: 3 });
    // ★ R090 — 살아남은 라이어가 키워드도 맞히면 +1(기본형 · 바보형 같음)
    expect(Object.fromEntries(liarRoundScores({ outcome: 'escaped', liar: 'L', guessOk: true, hitters: [] }))).toEqual({ L: 4 });
    expect(Object.fromEntries(liarRoundScores({ outcome: 'notfound', liar: 'L', guessOk: true, hitters: ['a'], mode: 'fool' }))).toEqual({ L: 4 });
  });
});

// ★ R091 (D-348) — 맞히기 이의제기
describe('이의제기', () => {
  it('버튼 — 답을 냈고 오답일 때만(빈 답 · 시간 초과 · 맞힘 = 없음)', () => {
    expect(canAppeal('뉴욕', false)).toBe(true);
    expect(canAppeal(null, false)).toBe(false); // 시간 초과
    expect(canAppeal('   ', false)).toBe(false); // 빈 답
    expect(canAppeal('', null)).toBe(false);
    expect(canAppeal('뉴욕', true)).toBe(false); // 맞힘
    expect(canAppeal('뉴욕', null)).toBe(false);
  });
  it('인정 > 기각 이어야 인정 · 동률 · 무투표 = 기각', () => {
    expect(appealPasses(2, 1)).toBe(true);
    expect(appealPasses(1, 0)).toBe(true);
    expect(appealPasses(1, 1)).toBe(false);
    expect(appealPasses(0, 0)).toBe(false);
    expect(appealPasses(1, 2)).toBe(false);
  });
  it('인정되면 각 경우의 맞히기 점수 그대로 — 세 outcome × 두 모드', () => {
    const sc = (outcome: 'caught' | 'escaped' | 'notfound', mode: 'basic' | 'fool', yes: number, no: number) =>
      liarRoundScores({ outcome, liar: 'L', guessOk: appealPasses(yes, no), hitters: ['a'], mode }).get('L') ?? 0;
    expect([sc('caught', 'basic', 2, 1), sc('caught', 'fool', 2, 1), sc('escaped', 'basic', 2, 1), sc('escaped', 'fool', 2, 1), sc('notfound', 'basic', 2, 1), sc('notfound', 'fool', 2, 1)]).toEqual([2, 1, 4, 4, 4, 4]);
    // 기각(동률)이면 지금처럼
    expect([sc('caught', 'basic', 1, 1), sc('caught', 'fool', 0, 0), sc('escaped', 'basic', 1, 1), sc('notfound', 'fool', 0, 2)]).toEqual([0, 0, 3, 3]);
  });
  it('시간 상수 — 버튼 8초 · 투표 10초', () => {
    expect([LIAR.APPEAL_MS, LIAR.APPEAL_VOTE_MS]).toEqual([8_000, 10_000]);
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

// ★ R101 — 단계 줄 · 토론 · 시간
describe('R101 라이어 — 단계 줄 · 토론 · 시간', () => {
  it('단계 줄 다섯 칸 — 재투표 · 죽일까 · 맞히기 · 이의제기는 칸 안', () => {
    expect([...LIAR_STEPS]).toEqual(['설명', '토론', '투표', '변론', '결과']);
    expect((['assign', 'describe', 'discuss', 'vote', 'revote', 'defense', 'final', 'guess', 'appeal', 'appealVote', 'reveal'] as const).map(liarStep)).toEqual([0, 0, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
  });
  it('[토론 끝] — 접속한 사람의 과반', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(discussNeed)).toEqual([1, 2, 2, 3, 3, 4, 4, 5]);
  });
  it('시간 — 토론 60 · 다시 토론 30 · 투표 20 · 재투표 15 · 죽일까 15 · 맞히기 20 · 공개 10 · 설명 · 변론 20 그대로', () => {
    expect([LIAR.DISCUSS_MS, LIAR.REDISCUSS_MS, LIAR.VOTE_MS, LIAR.REVOTE_MS, LIAR.FINAL_MS, LIAR.GUESS_MS, LIAR.REVEAL_MS, LIAR.SAY_MS, LIAR.DEFENSE_MS]).toEqual([
      60_000, 30_000, 20_000, 15_000, 15_000, 20_000, 10_000, 20_000, 20_000,
    ]);
    expect('TALLY_MS' in LIAR).toBe(false);
    expect(LIAR.ASSIGN_MS).toBeLessThanOrEqual(3_000);
  });
});
