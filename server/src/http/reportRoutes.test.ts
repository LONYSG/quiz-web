import { describe, expect, it } from 'vitest';
import { parseReportInput } from '@quiz/shared';
import { ANON_SCREENS, fillFromText, ipHash, reportContext } from './reportRoutes.js';
import type { Room } from '../rooms/types.js';

const none = { questionIndex: null, minigameKey: null, questionId: null, minigameItem: null };

describe('R061 제보 맥락', () => {
  it('방 밖이면 판 · 문항 · 미니게임 전부 null', async () => {
    const c = await reportContext(undefined, none);
    expect(c).toEqual({ roomId: null, gameId: null, questionId: null, questionIndex: null, minigameKey: null, minigameRunId: null, minigameItem: null });
  });

  it('문제 단계 — 문항은 id 만(정답 · 지문 없음) · 판 id', async () => {
    const room = {
      id: 'r1',
      state: 'QUESTION_ACTIVE',
      game: { gameId: '2151' },
      result: null,
      minigame: null,
      currentQuestion: { questionId: '2271', index: 6, text: '비밀 지문', answers: ['정답'] },
    } as unknown as Room;
    const c = await reportContext(room, none);
    expect(c).toMatchObject({ roomId: 'r1', gameId: '2151', questionId: '2271', questionIndex: 6 });
    expect(JSON.stringify(c)).not.toMatch(/비밀|정답/);
  });

  it('글의 "#번호" 로 문항을 채운다(있는 id 만 · 이미 있으면 그대로)', async () => {
    const base = await reportContext(undefined, none);
    const has = async (_k: 'q' | 'm', id: string) => id === '2271' || id === 'photo-0303';
    expect((await fillFromText(base, '#2271 정답이 둘 같아요', has)).questionId).toBe('2271');
    expect((await fillFromText(base, '#9999 없는 번호', has)).questionId).toBeNull();
    expect((await fillFromText(base, '사진 photo-0303 흐림', has)).minigameItem).toBe('photo-0303');
    expect((await fillFromText({ ...base, questionId: '5' }, '#2271', has)).questionId).toBe('5');
  });

  it('입력 검사 — 빈 글 거부 · 문항 제보는 사유만으로 · 500자 자르기 · 모르는 종류 거부', () => {
    expect(parseReportInput({ kind: 'bug', text: '  ', screen: 'lobby' }).ok).toBe(false);
    expect(parseReportInput({ kind: 'question', text: '', reasons: ['answer'], screen: 'game:reveal' }).ok).toBe(true);
    const long = parseReportInput({ kind: 'idea', text: '가'.repeat(600), screen: 'lobby' });
    expect(long.ok && [...long.value.text].length).toBe(500);
    expect(parseReportInput({ kind: 'spam', text: 'x', screen: 'lobby' }).ok).toBe(false);
  });

  it('R063 로그인 전 — auth · password-change 만 비로그인 허용 · ip 는 해시 16자(원 IP 없음)', () => {
    expect(ANON_SCREENS.has('auth') && ANON_SCREENS.has('password-change')).toBe(true);
    expect(ANON_SCREENS.has('lobby') || ANON_SCREENS.has('room') || ANON_SCREENS.has('game:question')).toBe(false);
    const h = ipHash('203.0.113.7', 'secret-abcdefgh');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).not.toContain('203');
    expect(ipHash('203.0.113.7', 'other-secret')).not.toBe(h);
  });

  it('R063 device — 해상도 · 배율 · 테마 · UI 를 받고 · 로그인 칸 아이디만(40자)', () => {
    const r = parseReportInput({ kind: 'bug', text: 'x', screen: 'auth', loginHint: '  chanjong  ', device: { screen: '1536x864', dpr: 1.25, theme: 'night', ui: 'pc', password: 'nope' } });
    expect(r.ok && r.value.device).toEqual({ screen: '1536x864', dpr: 1.25, theme: 'night', ui: 'pc' });
    expect(r.ok && r.value.loginHint).toBe('chanjong');
  });
});
