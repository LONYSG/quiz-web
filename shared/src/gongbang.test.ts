import { describe, expect, it } from 'vitest';
import {
  bannedWordOf,
  canEnter,
  clampMaxPlayers,
  isRoomPassword,
  parseQuickJoinOpts,
  pickQuickJoin,
  quickJoinMismatch,
  quickJoinOptCount,
  quizMinigameKeys,
  rankQuickJoin,
  roomKindOf,
  sortRoomList,
  type RoomListItem,
} from './gongbang.js';
import { minigameInfo } from './minigame.js';

const item = (p: Partial<RoomListItem> & { code: string }): RoomListItem => ({
  title: p.code,
  kind: 'quiz',
  tag: null,
  players: 2,
  max: 8,
  locked: false,
  phase: 'waiting',
  paused: false,
  progress: null,
  minigames: false,
  level: 'intermediate',
  ...p,
});

describe('공방 — 방 종류 · 정원 · 비밀번호 (R116 · docs/24 3절)', () => {
  it('방 종류 = mode 에서', () => {
    expect(roomKindOf('quiz')).toBe('quiz');
    expect(roomKindOf('minigame')).toBe('quiz');
    expect(roomKindOf('song')).toBe('quiz');
    expect(roomKindOf('draw')).toBe('draw');
    expect(roomKindOf('liar')).toBe('liar');
  });
  it('정원 — 퀴즈 · 캐치 2~10 · 라이어 3~10', () => {
    expect(clampMaxPlayers('quiz', 2)).toBe(2);
    expect(clampMaxPlayers('quiz', 1)).toBeNull();
    expect(clampMaxPlayers('liar', 2)).toBeNull();
    expect(clampMaxPlayers('draw', 10)).toBe(10);
    expect(clampMaxPlayers('quiz', 11)).toBeNull();
    expect(clampMaxPlayers('quiz', 4.5)).toBeNull();
  });
  it('비밀번호 = 숫자 4자리', () => {
    expect(isRoomPassword('0371')).toBe(true);
    expect(isRoomPassword('371')).toBe(false);
    expect(isRoomPassword('03715')).toBe(false);
    expect(isRoomPassword('abcd')).toBe(false);
    expect(isRoomPassword(1234)).toBe(false);
  });
  it('공방 미니게임 기본 = 퀴즈형만', () => {
    const keys = quizMinigameKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(minigameInfo(k).kind).toBe('quiz');
  });
});

describe('공방 목록 정렬 — 들어갈 수 있는 방 먼저(찬종 ④)', () => {
  it('잠긴 방 · 꽉 찬 방은 아래 · 대기 먼저 · 사람 많은 순', () => {
    const list = sortRoomList([
      item({ code: 'locked', locked: true, players: 7 }),
      item({ code: 'full', players: 8 }),
      item({ code: 'play', phase: 'playing', progress: { done: 3, total: 20 }, players: 6 }),
      item({ code: 'wait2', players: 2 }),
      item({ code: 'wait5', players: 5 }),
      item({ code: 'almostDone', phase: 'playing', progress: { done: 19, total: 20 }, players: 7 }),
    ]);
    expect(list.map((x) => x.code)).toEqual(['wait5', 'wait2', 'play', 'almostDone', 'full', 'locked']);
  });
});

describe('빠른 입장 — 옵션 · 가장 비슷한 방(docs/24 3-7)', () => {
  it('옵션 읽기 — 셋 다 고른 난이도는 상관없음 · 모르는 값은 기본', () => {
    expect(parseQuickJoinOpts({ levels: ['beginner', 'intermediate', 'advanced'] }).levels).toEqual([]);
    expect(parseQuickJoinOpts({ levels: ['advanced', 'x'], minigame: 'with', size: 'huge', waitingOnly: 1 })).toEqual({
      levels: ['advanced'],
      minigame: 'with',
      size: 'any',
      waitingOnly: false,
    });
    expect(quickJoinOptCount(parseQuickJoinOpts({ levels: ['advanced'], waitingOnly: true }))).toBe(2);
  });
  it('어긋난 칸', () => {
    const o = parseQuickJoinOpts({ levels: ['advanced'], minigame: 'without', size: 'small', waitingOnly: true });
    expect(quickJoinMismatch(item({ code: 'a', level: 'advanced' }), o)).toEqual([]);
    expect(quickJoinMismatch(item({ code: 'b', level: 'beginner', minigames: true, players: 6, phase: 'playing' }), o)).toEqual(['size', 'waiting', 'minigame', 'level']);
    // 캐치 · 라이어에는 난이도 · 미니게임이 뜻이 없다
    expect(quickJoinMismatch(item({ code: 'c', kind: 'draw', level: null }), o)).toEqual([]);
  });
  it('딱 맞는 방이 있으면 그 방 · 없으면 덜 중요한 칸부터 버린 방', () => {
    const o = parseQuickJoinOpts({ levels: ['advanced'], minigame: 'without' });
    const exact = pickQuickJoin([item({ code: 'x', level: 'beginner' }), item({ code: 'ok', level: 'advanced' })], o);
    expect(exact?.item.code).toBe('ok');
    expect(exact?.mismatch).toEqual([]);
    // 난이도가 맞고 미니게임만 어긋난 방(4) < 미니게임은 맞고 난이도가 어긋난 방(8)
    const near = pickQuickJoin([item({ code: 'lvBad', level: 'beginner' }), item({ code: 'mgBad', level: 'advanced', minigames: true })], o);
    expect(near?.item.code).toBe('mgBad');
    expect(near?.mismatch).toEqual(['minigame']);
  });
  it('들어갈 수 없는 방 · 일시정지는 후보가 아니다 · 없으면 null', () => {
    const o = parseQuickJoinOpts({});
    expect(pickQuickJoin([item({ code: 'l', locked: true }), item({ code: 'f', players: 8 }), item({ code: 'p', paused: true, phase: 'playing' })], o)).toBeNull();
  });
  it('같은 무게면 3-7 차례 — 대기 2명 이상 → 대기 1명 → 진행 중 퀴즈 → 라이어 · 정원 80% 넘은 방은 뒤', () => {
    const o = parseQuickJoinOpts({});
    const r = rankQuickJoin(
      [
        item({ code: 'liar', kind: 'liar', phase: 'playing', progress: { done: 1, total: 5 }, players: 4, level: null }),
        item({ code: 'play', phase: 'playing', progress: { done: 2, total: 20 }, players: 4 }),
        item({ code: 'solo', players: 1 }),
        item({ code: 'crowd', players: 7 }),
        item({ code: 'group', players: 4 }),
      ],
      o,
    ).map((x) => x.item.code);
    expect(r).toEqual(['group', 'crowd', 'solo', 'play', 'liar']);
    expect(canEnter(item({ code: 'z', players: 7, max: 8 }))).toBe(true);
  });
});

describe('금칙어 — 방 제목 · 닉네임', () => {
  it('끼워 넣은 기호 · 띄어쓰기도 잡는다', () => {
    expect(bannedWordOf('씨 발 방')).toBe('씨발');
    expect(bannedWordOf('F.u.c.k room')).toBe('fuck');
    expect(bannedWordOf('지1랄')).toBe('지랄');
  });
  it('흔한 낱말은 걸지 않는다', () => {
    for (const ok of ['퇴근 후 상식 한 판', '시발점부터 다시', '보지마 보지마', '새끼손가락', '자지러지게 웃긴 방', '섹시한 엑스맨']) expect(bannedWordOf(ok)).toBeNull();
  });
});
