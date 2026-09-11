// =============================================================================
// 일시정지 테스트 (Phase 5 / R015) — T20 / T21 / T22 / T23 / T14
//
// ★★ 여기서 고정하는 것은 **판단 규칙**이다. 실제 동작은 봇 시나리오가 잰다.
//   ★ 근거 (D-028): 순수 함수 테스트는 "그 함수가 옳다" 만 보장하고
//     "실제로 그 함수를 부르는지" 는 보장하지 못한다. 두 겹이 다 필요하다.
//     · 이 파일            → 규칙 (남은 시간 보존 / 자동 재개 없음 / 만료 재시작)
//     · bot pause/abandon  → 실제 서버에서 같은 일이 벌어지는지
//
// ★★ 자동 재개가 없다는 것을 테스트로 못 박는다.
//   ★ R014 의 근사 구현(D-061)은 사람이 돌아오면 자동으로 진행됐고,
//     그것이 Q-30 확정 규칙 위반이었다. 회귀하면 여기서 깨진다.
// =============================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import type { Server } from 'socket.io';
import { RULES } from '@quiz/shared';
import { config } from '../config.js';
import { bindIo } from '../rooms/emit.js';
import {
  broadcastPauseStatus,
  checkAbandon,
  idleDeleteApplies,
  pauseIfNoActive,
  pauseView,
  resumeGame,
} from './pause.js';
import type { CurrentQuestion, Player, Room } from '../rooms/types.js';

const NOW = 1_700_000_000_000;

/** ★ 브로드캐스트를 기록하는 가짜 io. emitRoom 은 bindIo 없이는 던진다 */
const emitted: { event: string; payload: unknown }[] = [];
bindIo({
  to: () => ({
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
  }),
} as unknown as Server);

function player(over: Partial<Player> = {}): Player {
  return {
    accountId: 'A',
    nickname: '가',
    colorIndex: 0,
    joinOrder: 0,
    connected: true,
    socketId: 's1',
    disconnectedAt: null,
    score: 0,
    ...over,
  };
}

function question(over: Partial<CurrentQuestion> = {}): CurrentQuestion {
  return {
    epoch: 3,
    index: 1,
    questionId: '10',
    text: '훈민정음을 창제한 조선의 왕은?',
    categoryName: '한국',
    answersNorm: new Set(['세종']),
    displayAnswer: '세종',
    answersRaw: ['세종'],
    hint: 'ㅅㅈ',
    hintPushed: false,
    explanation: null,
    experiencedAccountIds: new Set(),
    startedAt: NOW,
    endsAt: NOW + RULES.QUESTION_DURATION_MS,
    resolved: false,
    skipVotes: new Set(),
    selectionStage: 1,
    ...over,
  };
}

function room(over: Partial<Room> = {}, q: CurrentQuestion | null = question()): Room {
  return {
    id: 'r1',
    title: '테스트',
    hostAccountId: 'A',
    createdBy: 'A',
    createdAt: NOW,
    state: 'QUESTION_ACTIVE',
    // ★ 기본은 **전원 접속 종료**다. 이 파일의 주제가 "활성 0명" 이기 때문이다
    players: new Map([['A', player({ connected: false, socketId: null })]]),
    nextJoinOrder: 1,
    settings: { questionCount: 3, startMode: 'instant', countdownSec: 5 },
    settingsLocked: true,
    countdownEndsAt: null,
    startingGame: false,
    availableQuestionCount: 10,
    experienceRates: null,
    lastGameSettings: null,
    chat: [],
    hostGraceUntil: null,
    emptySince: null,
    game: null,
    currentQuestion: q,
    result: null,
    paused: null,
    chatTimestamps: new Map(),
    ...over,
  } as Room;
}

beforeEach(() => {
  emitted.length = 0;
});

describe('T21 — 활성 0명이면 즉시 PAUSED', () => {
  it('★ 문제 진행 중 전원 이탈 → PAUSED. 남은 시간이 보존된다', () => {
    const r = room({}, question({ endsAt: NOW + 12_000 }));
    expect(pauseIfNoActive(r, NOW)).toBe(true);
    expect(r.state).toBe('PAUSED');
    expect(r.paused?.pausedFrom).toBe('QUESTION_ACTIVE');
    // ★★ 이 값이 이 설계의 핵심이다. endsAt 을 미루지 않고 남은 시간을 저장한다
    expect(r.paused?.remainingMs).toBe(12_000);
    expect(r.paused?.abandonAt).toBe(NOW + config.tuning.pauseAbandonMs);
    expect(emitted.map((e) => e.event)).toContain('game.paused');
  });

  it('★ 한 명이라도 접속해 있으면 멈추지 않는다', () => {
    const r = room({ players: new Map([['A', player()]]) });
    expect(pauseIfNoActive(r, NOW)).toBe(false);
    expect(r.state).toBe('QUESTION_ACTIVE');
    expect(r.paused).toBeNull();
  });

  it('★★ 유예가 없다 — 끊긴 직후 시각에 바로 멈춘다', () => {
    const r = room(
      { players: new Map([['A', player({ connected: false, socketId: null, disconnectedAt: NOW })]]) },
      question({ endsAt: NOW + 30_000 }),
    );
    // ★ 근거: 유예를 두면 그 사이에 타이머가 흐른다. 그것이 막으려던 것이다 (Q-30)
    expect(pauseIfNoActive(r, NOW)).toBe(true);
    expect(r.paused?.remainingMs).toBe(30_000);
  });

  it('★ 이미 PAUSED 이면 true 를 돌려주고 값을 덮어쓰지 않는다', () => {
    const r = room({}, question({ endsAt: NOW + 20_000 }));
    pauseIfNoActive(r, NOW);
    const first = r.paused;
    expect(pauseIfNoActive(r, NOW + 5_000)).toBe(true);
    expect(r.paused).toBe(first);
    expect(r.paused?.remainingMs).toBe(20_000);
  });

  it('★ 이미 지난 문제는 음수가 아니라 0 으로 저장한다', () => {
    // ★ 근거: 음수로 저장하면 재개하는 순간 즉시 만료되어 그 문제가 사라진다
    const r = room({}, question({ endsAt: NOW - 3_000 }));
    pauseIfNoActive(r, NOW);
    expect(r.paused?.remainingMs).toBe(0);
  });
});

describe('T20 / T22 — 다른 상태에서의 일시정지', () => {
  it('★ COUNTDOWN 도 멈춘다 (T20)', () => {
    const r = room({ state: 'COUNTDOWN', countdownEndsAt: NOW + 4_000 }, null);
    expect(pauseIfNoActive(r, NOW)).toBe(true);
    expect(r.paused?.pausedFrom).toBe('COUNTDOWN');
    expect(r.paused?.remainingMs).toBe(4_000);
  });

  it('★ 정답 공개 5초 대기도 멈춘다 (T22)', () => {
    const r = room({
      state: 'QUESTION_RESOLVED',
      game: { resolution: { nextAt: NOW + 3_200 } } as Room['game'],
    });
    expect(pauseIfNoActive(r, NOW)).toBe(true);
    expect(r.paused?.pausedFrom).toBe('QUESTION_RESOLVED');
    expect(r.paused?.remainingMs).toBe(3_200);
  });

  it('★★ LOBBY 와 GAME_RESULT 는 PAUSED 로 가지 않는다', () => {
    // ★ 근거: 멈출 타이머가 없다. 기존 방 삭제 경로(활성 0명 10분)를 그대로 탄다
    for (const state of ['LOBBY', 'GAME_RESULT'] as const) {
      const r = room({ state }, null);
      expect(pauseIfNoActive(r, NOW)).toBe(false);
      expect(r.state).toBe(state);
      expect(r.paused).toBeNull();
    }
  });
});

describe('T23 — 재개는 방장이 눌러야만 일어난다', () => {
  it('★★ 남은 시간을 그대로 이어 붙인다 (endsAt 을 다시 계산한다)', () => {
    const r = room({}, question({ endsAt: NOW + 18_000 }));
    pauseIfNoActive(r, NOW);
    r.players.set('A', player()); // ★ 방장이 돌아왔다

    const before = Date.now();
    expect(resumeGame(r)).toEqual({ ok: true });
    expect(r.state).toBe('QUESTION_ACTIVE');
    expect(r.paused).toBeNull();
    // ★ 새 endsAt = 재개 시각 + 남은 시간. 멈춰 있던 시간은 흐르지 않았다
    const remainNow = (r.currentQuestion?.endsAt ?? 0) - before;
    expect(remainNow).toBeGreaterThanOrEqual(17_900);
    expect(remainNow).toBeLessThanOrEqual(18_100);
  });

  it('★★★ epoch 를 올리지 않는다 (같은 문제를 이어서 한다)', () => {
    // ★ 근거: 올리면 재개 직후 모든 클라이언트의 epoch 가 낡은 것이 되어
    //   그 문제 동안 아무도 정답을 낼 수 없다
    const r = room({}, question({ epoch: 7 }));
    pauseIfNoActive(r, NOW);
    r.players.set('A', player());
    resumeGame(r);
    expect(r.currentQuestion?.epoch).toBe(7);
  });

  it('★ startedAt 은 건드리지 않는다 (DB 의 started_at 과 어긋나면 안 된다)', () => {
    const r = room({}, question({ startedAt: NOW }));
    pauseIfNoActive(r, NOW);
    r.players.set('A', player());
    resumeGame(r);
    expect(r.currentQuestion?.startedAt).toBe(NOW);
  });

  it('★ PAUSED 가 아니면 거부한다', () => {
    expect(resumeGame(room())).toEqual({ ok: false, reason: 'not_paused' });
  });

  it('★★ 아무도 없으면 재개하지 않는다 (재개해도 즉시 다시 멈춘다)', () => {
    const r = room();
    pauseIfNoActive(r, NOW);
    expect(resumeGame(r)).toEqual({ ok: false, reason: 'no_active' });
    expect(r.state).toBe('PAUSED');
  });

  it('★ COUNTDOWN 재개는 카운트다운 만료 시각을 다시 잡는다', () => {
    const r = room({ state: 'COUNTDOWN', countdownEndsAt: NOW + 5_000 }, null);
    pauseIfNoActive(r, NOW);
    r.players.set('A', player());
    const before = Date.now();
    expect(resumeGame(r)).toEqual({ ok: true });
    expect(r.state).toBe('COUNTDOWN');
    expect((r.countdownEndsAt ?? 0) - before).toBeGreaterThanOrEqual(4_900);
  });
});

describe('T14 — 만료되면 방을 폭파한다 (Q-82 개정)', () => {
  // ★ QUESTION_ACTIVE 로 멈추면 abortQuestionSync 가 DB 를 건드린다.
  //   ★ 여기서는 판단 규칙만 보므로 COUNTDOWN 으로 멈춘 방을 쓴다
  function pausedRoom(): Room {
    const r = room({ state: 'COUNTDOWN', countdownEndsAt: NOW + 3_000 }, null);
    pauseIfNoActive(r, NOW);
    return r;
  }

  it('★ 만료 전에는 폭파하지 않는다', () => {
    const r = pausedRoom();
    expect(checkAbandon(r, NOW + config.tuning.pauseAbandonMs - 1)).toBe(false);
  });

  it('★★ 만료 시각에 도달하면 폭파한다', () => {
    const r = pausedRoom();
    expect(checkAbandon(r, NOW + config.tuning.pauseAbandonMs)).toBe(true);
  });

  it('★★★ 한 명이라도 돌아오면 만료 시계를 처음부터 다시 센다', () => {
    // ★ 규칙 문구가 "5분 동안 **아무도 안 돌아오면**" 이다.
    //   ★ 돌아왔다 다시 나간 것은 처음부터 다시 세는 것이 맞다
    const r = pausedRoom();
    const late = NOW + config.tuning.pauseAbandonMs - 1_000;
    r.players.set('A', player());
    expect(checkAbandon(r, late)).toBe(false);
    expect(r.paused?.abandonAt).toBe(late + config.tuning.pauseAbandonMs);

    // 다시 전원 이탈 → 새 기준으로 센다
    r.players.set('A', player({ connected: false, socketId: null }));
    expect(checkAbandon(r, late + config.tuning.pauseAbandonMs - 1)).toBe(false);
    expect(checkAbandon(r, late + config.tuning.pauseAbandonMs)).toBe(true);
  });

  it('★ PAUSED 가 아니면 아무 판단도 하지 않는다', () => {
    expect(checkAbandon(room(), NOW + 10 * 60_000)).toBe(false);
  });
});

describe('D-066 — 타이머는 배타적이다', () => {
  it('★★ PAUSED 중에는 방 삭제 타이머(10분)를 적용하지 않는다', () => {
    const r = room();
    pauseIfNoActive(r, NOW);
    expect(idleDeleteApplies(r)).toBe(false);
  });

  it('★ LOBBY / GAME_RESULT 는 방 삭제 타이머를 적용한다', () => {
    expect(idleDeleteApplies(room({ state: 'LOBBY' }, null))).toBe(true);
    expect(idleDeleteApplies(room({ state: 'GAME_RESULT' }, null))).toBe(true);
  });
});

describe('화면에 보낼 값', () => {
  it('★ 복귀 현황이 N/M 으로 나간다', () => {
    const r = room({
      players: new Map([
        ['A', player({ connected: false, socketId: null })],
        ['B', player({ accountId: 'B', nickname: '나', connected: false, socketId: null })],
      ]),
    });
    pauseIfNoActive(r, NOW);
    r.players.set('A', player());

    const view = pauseView(r);
    expect(view?.returned).toBe(1);
    expect(view?.total).toBe(2);

    emitted.length = 0;
    broadcastPauseStatus(r);
    expect(emitted[0]?.event).toBe('game.pauseStatus');
    expect(emitted[0]?.payload).toMatchObject({ returned: 1, total: 2 });
  });

  it('★ PAUSED 가 아니면 보낼 것이 없다', () => {
    expect(pauseView(room())).toBeNull();
    emitted.length = 0;
    broadcastPauseStatus(room());
    expect(emitted).toHaveLength(0);
  });
});
