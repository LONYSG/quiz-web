// =============================================================================
// 정답 판정 테스트 (Phase 3 / guide 16·18절)
//
// ★★ 판정 조건 7가지를 하나씩 고정한다 (04-PROTOCOL 2장).
//   state=QUESTION_ACTIVE / resolved=false / ★ epoch 일치 / ★ 수신시각 ≤ endsAt /
//   발신자 connected / ★ 미경험자 / 정규화 일치
//
// ★ 여기서 검증하는 것은 **판정 함수**다. 동시성은 봇 시나리오가 검증한다.
//   ★ 근거 (D-028): 순수 함수 테스트는 "그 함수가 옳다" 만 보장하고
//     "실제로 그 함수를 부르는지" 는 보장하지 못한다. 두 겹이 다 필요하다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { RULES } from '@quiz/shared';
import { checkChatRate, judgeAnswer } from './answer.js';
import type { CurrentQuestion, Player, Room } from '../rooms/types.js';

const NOW = 1_700_000_000_000;

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
    answersNorm: new Set(['세종', '세종대왕']),
    displayAnswer: '세종',
    answersRaw: ['세종', '세종대왕'],
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
    players: new Map([['A', player()]]),
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

describe('정규화 일치 (guide 16절)', () => {
  it('정답과 정확히 같으면 정답이다', () => {
    const r = judgeAnswer(room(), player(), { rawText: '세종', epoch: 3, receivedAt: NOW + 100 });
    expect(r.accepted).toBe(true);
    expect(r.matched).toBe(true);
    expect(r.rejectReason).toBeNull();
  });

  it('★ 복수 정답 어느 것이든 인정한다 (guide 17절)', () => {
    const r = judgeAnswer(room(), player(), {
      rawText: '세종대왕',
      epoch: 3,
      receivedAt: NOW + 100,
    });
    expect(r.accepted).toBe(true);
  });

  it('★ 띄어쓰기와 대소문자는 무시한다', () => {
    const q = question({ answersNorm: new Set(['newyork']) });
    const r = judgeAnswer(room({}, q), player(), {
      rawText: 'New York',
      epoch: 3,
      receivedAt: NOW + 100,
    });
    expect(r.accepted).toBe(true);
  });

  it('★★ 오타는 인정하지 않는다. fuzzy matching 금지 (guide 16절)', () => {
    const r = judgeAnswer(room(), player(), {
      rawText: '세종대왕님',
      epoch: 3,
      receivedAt: NOW + 100,
    });
    expect(r.matched).toBe(false);
    expect(r.accepted).toBe(false);
    // ★ 일치하지 않으면 사유도 남기지 않는다. 그냥 일반 채팅이다 (guide 15절)
    expect(r.rejectReason).toBeNull();
  });

  it('★ 기호 차이는 다른 문자열이다 (A+B ≠ AB)', () => {
    const q = question({ answersNorm: new Set(['a+b']) });
    const r = judgeAnswer(room({}, q), player(), {
      rawText: 'AB',
      epoch: 3,
      receivedAt: NOW + 100,
    });
    expect(r.matched).toBe(false);
  });

  it('일치하지 않는 메시지는 answer_events 대상이 아니다 (Q-52)', () => {
    const r = judgeAnswer(room(), player(), { rawText: '안녕', epoch: 3, receivedAt: NOW });
    expect(r.matched).toBe(false);
  });
});

describe('★★ 장치 B — epoch (guide 20절)', () => {
  it('★★ epoch 가 다르면 정답 문자열이 같아도 판정하지 않는다', () => {
    const r = judgeAnswer(room(), player(), {
      rawText: '세종',
      // ★ 이전 문제를 보고 있던 클라이언트가 보낸 메시지다
      epoch: 2,
      receivedAt: NOW + 100,
    });
    expect(r.matched).toBe(true);
    expect(r.accepted).toBe(false);
    expect(r.rejectReason).toBe('epoch_mismatch');
    // ★ 자격 자체는 있었다. 문제가 바뀐 것이다
    expect(r.wasEligible).toBe(true);
  });

  it('★★ epoch 가 없으면(옛 클라이언트) 판정하지 않는다. 조용히 통과시키지 않는다', () => {
    const r = judgeAnswer(room(), player(), { rawText: '세종', epoch: null, receivedAt: NOW });
    expect(r.accepted).toBe(false);
    expect(r.rejectReason).toBe('epoch_mismatch');
  });

  it('epoch 0 을 null 로 취급하지 않는다', () => {
    const q = question({ epoch: 0 });
    const r = judgeAnswer(room({}, q), player(), {
      rawText: '세종',
      epoch: 0,
      receivedAt: NOW,
    });
    expect(r.accepted).toBe(true);
  });
});

describe('★ 정답 인정 경계는 endsAt 이다 (guide 18절)', () => {
  it('endsAt 정확히 그 시각은 인정한다', () => {
    const q = question();
    const r = judgeAnswer(room({}, q), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: q.endsAt,
    });
    expect(r.accepted).toBe(true);
  });

  it('★★ endsAt 을 1ms 넘기면 인정하지 않는다', () => {
    const q = question();
    const r = judgeAnswer(room({}, q), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: q.endsAt + 1,
    });
    expect(r.accepted).toBe(false);
    expect(r.rejectReason).toBe('past_deadline');
  });

  it('★ tick 오차 구간(만료 후 100ms)에 도착한 답을 시각으로 잘라낸다', () => {
    // ★ tick 이 100ms 주기라 만료 후 최대 100ms 동안 상태가 아직 ACTIVE 다.
    //   ★ 그 사이 도착한 답이 인정되면 "정확히 30초" 가 깨진다.
    const q = question();
    const r = judgeAnswer(room({ state: 'QUESTION_ACTIVE' }, q), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: q.endsAt + 50,
    });
    expect(r.rejectReason).toBe('past_deadline');
  });
});

describe('★ 장치 A — 이미 끝난 문제', () => {
  it('resolved 면 판정하지 않는다', () => {
    const q = question({ resolved: true });
    const r = judgeAnswer(room({}, q), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: NOW,
    });
    expect(r.accepted).toBe(false);
    expect(r.rejectReason).toBe('already_resolved');
  });

  it('★ QUESTION_RESOLVED 구간의 메시지는 판정하지 않는다', () => {
    const r = judgeAnswer(room({ state: 'QUESTION_RESOLVED' }), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: NOW,
    });
    expect(r.rejectReason).toBe('already_resolved');
  });

  it('★ GAME_RESULT 에서도 판정하지 않는다', () => {
    const r = judgeAnswer(room({ state: 'GAME_RESULT' }), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: NOW,
    });
    expect(r.accepted).toBe(false);
  });

  it('★ PAUSED 에서도 판정하지 않는다 (Phase 5 대비)', () => {
    const r = judgeAnswer(room({ state: 'PAUSED' }), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: NOW,
    });
    expect(r.accepted).toBe(false);
  });

  it('문제가 없으면 아무것도 하지 않는다 (로비 채팅)', () => {
    const r = judgeAnswer(room({ state: 'LOBBY' }, null), player(), {
      rawText: '세종',
      epoch: null,
      receivedAt: NOW,
    });
    expect(r.matched).toBe(false);
    expect(r.question).toBeNull();
  });
});

describe('★ 경험자는 판정에서 제외된다 (guide 28·29절)', () => {
  it('★★ 경험자가 정답을 맞혀도 정답자가 되지 않는다', () => {
    const q = question({ experiencedAccountIds: new Set(['A']) });
    const r = judgeAnswer(room({}, q), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: NOW,
    });
    expect(r.matched).toBe(true);
    expect(r.accepted).toBe(false);
    expect(r.rejectReason).toBe('experienced');
    // ★★ 자격 자체가 없었다는 뜻이다. answer_events 의 was_eligible 이 false 가 된다
    expect(r.wasEligible).toBe(false);
  });

  it('다른 사람이 경험자여도 나는 판정된다', () => {
    const q = question({ experiencedAccountIds: new Set(['B']) });
    const r = judgeAnswer(room({}, q), player(), {
      rawText: '세종',
      epoch: 3,
      receivedAt: NOW,
    });
    expect(r.accepted).toBe(true);
  });
});

describe('★ 발신자가 접속 중이어야 한다', () => {
  it('끊긴 플레이어의 메시지는 판정하지 않는다', () => {
    const r = judgeAnswer(room(), player({ connected: false }), {
      rawText: '세종',
      epoch: 3,
      receivedAt: NOW,
    });
    expect(r.accepted).toBe(false);
    expect(r.rejectReason).toBe('not_connected');
  });
});

describe('★ 판정 조건의 우선순위', () => {
  it('★ 경험자이면서 epoch 도 틀리면 epoch 가 먼저 걸린다', () => {
    // ★ 순서가 중요하다 — epoch 불일치는 "문제가 바뀐 것" 이고
    //   경험자 제외는 "자격이 없는 것" 이다. 전자가 먼저 판단되어야
    //   was_eligible 기록이 왜곡되지 않는다
    const q = question({ experiencedAccountIds: new Set(['A']) });
    const r = judgeAnswer(room({}, q), player(), {
      rawText: '세종',
      epoch: 2,
      receivedAt: NOW,
    });
    expect(r.rejectReason).toBe('epoch_mismatch');
  });
});

describe('채팅 rate limit (Q-18: 3초 10개)', () => {
  const limits = { windowMs: RULES.CHAT_RATE_WINDOW_MS, max: RULES.CHAT_RATE_MAX };

  it('상한까지는 허용한다', () => {
    const r = room();
    for (let i = 0; i < RULES.CHAT_RATE_MAX; i += 1) {
      expect(checkChatRate(r, 'A', NOW + i, limits)).toBeNull();
    }
  });

  it('★ 상한을 넘으면 막고 재시도 시각을 알려준다', () => {
    const r = room();
    for (let i = 0; i < RULES.CHAT_RATE_MAX; i += 1) checkChatRate(r, 'A', NOW, limits);
    const wait = checkChatRate(r, 'A', NOW, limits);
    expect(wait).not.toBeNull();
    expect(wait!).toBeGreaterThan(0);
    expect(wait!).toBeLessThanOrEqual(RULES.CHAT_RATE_WINDOW_MS);
  });

  it('★★ 정상적인 연타(초당 3개)를 막지 않는다', () => {
    // ★ 이 게임은 정답을 맹렬히 타이핑하는 게임이다 (04-PROTOCOL 4장).
    //   ★ 초당 3개를 10초간 보내도 막히지 않아야 한다
    const r = room();
    let blocked = 0;
    for (let i = 0; i < 30; i += 1) {
      if (checkChatRate(r, 'A', NOW + i * 333, limits) !== null) blocked += 1;
    }
    expect(blocked).toBe(0);
  });

  it('윈도가 지나면 다시 허용한다', () => {
    const r = room();
    for (let i = 0; i < RULES.CHAT_RATE_MAX; i += 1) checkChatRate(r, 'A', NOW, limits);
    expect(checkChatRate(r, 'A', NOW, limits)).not.toBeNull();
    expect(
      checkChatRate(r, 'A', NOW + RULES.CHAT_RATE_WINDOW_MS + 1, limits),
    ).toBeNull();
  });

  it('★ 계정별로 따로 센다', () => {
    const r = room();
    for (let i = 0; i < RULES.CHAT_RATE_MAX; i += 1) checkChatRate(r, 'A', NOW, limits);
    expect(checkChatRate(r, 'A', NOW, limits)).not.toBeNull();
    expect(checkChatRate(r, 'B', NOW, limits)).toBeNull();
  });

  it('★ 기록이 무한히 자라지 않는다 (윈도 밖은 버린다)', () => {
    const r = room();
    for (let i = 0; i < 100; i += 1) checkChatRate(r, 'A', NOW + i * 1000, limits);
    expect(r.chatTimestamps.get('A')!.length).toBeLessThanOrEqual(RULES.CHAT_RATE_MAX);
  });
});
