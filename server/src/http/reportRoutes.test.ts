import { describe, expect, it } from 'vitest';
import { parseReportInput } from '@quiz/shared';
import { ANON_SCREENS, fillFromText, ipHash, pastTarget, reportContext } from './reportRoutes.js';
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

  it('R065 최근 목록의 지난 대상 — 판 · 미니게임 판은 제보자가 참가한 것만(못 찾으면 null · 거부 없음)', async () => {
    const room = { id: 'r1', state: 'QUESTION_ACTIVE', game: { gameId: '900' }, result: null, minigame: null, currentQuestion: { questionId: '5', index: 2 } } as unknown as Room;
    const find = {
      gameOfQuestion: async (acc: string, qid: string) => (acc === '7' && qid === '2271' ? '850' : null),
      runOfMinigame: async (acc: string, key: string) => (acc === '7' && key === 'angle' ? { runId: '523', gameId: '851' } : null),
    };
    const q = { ...none, questionId: '2271', questionIndex: 3, at: new Date().toISOString() };
    const c1 = await pastTarget(await reportContext(room, q), '7', q, find);
    expect(c1).toMatchObject({ roomId: 'r1', gameId: '850', questionId: '2271', questionIndex: 3, minigameRunId: null });
    // 남의 판 — 판 번호 없이(지금 방의 900 도 붙이지 않는다)
    expect((await pastTarget(await reportContext(room, q), '8', q, find)).gameId).toBeNull();
    const m = { ...none, minigameKey: 'angle', at: new Date().toISOString() };
    expect(await pastTarget(await reportContext(room, m), '7', m, find)).toMatchObject({ gameId: '851', minigameKey: 'angle', minigameRunId: '523', questionId: null });
    expect(await pastTarget(await reportContext(room, m), '8', m, find)).toMatchObject({ gameId: null, minigameRunId: null });
    // at 이 없으면(일반 제보 · 지금 화면) 그대로
    expect((await pastTarget(await reportContext(room, none), '7', { ...none, at: null }, find)).gameId).toBe('900');
  });

  it('R065 at — ISO 시각만 · 이틀보다 오래되거나 먼 미래면 버림', () => {
    const now = new Date().toISOString();
    const ok = parseReportInput({ kind: 'question', reasons: ['answer'], screen: 'lobby', at: now });
    expect(ok.ok && ok.value.at).toBe(now);
    const old = parseReportInput({ kind: 'question', reasons: ['answer'], screen: 'lobby', at: '2001-01-01T00:00:00Z' });
    expect(old.ok && old.value.at).toBeNull();
    const bad = parseReportInput({ kind: 'question', reasons: ['answer'], screen: 'lobby', at: 'x' });
    expect(bad.ok && bad.value.at).toBeNull();
  });
});
