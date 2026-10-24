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
import { flexAnswerSet, normalizeAnswer, RULES } from '@quiz/shared';
import { checkChatRate, checkEmojiRate, checkSpecialEmojiRate, judgeAnswer } from './answer.js';
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
    awayMs: 0,
    avatarV: null,
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
    generalHint: null,
    generalHintPushed: false,
    explanation: null,
    experiencedAccountIds: new Set(),
    startedAt: NOW,
    endsAt: NOW + RULES.QUESTION_DURATION_MS,
    resolved: false,
    skipVotes: new Set(),
    selectionStage: 1,
    winnerArrivedNs: null,
    lateAnswers: [],
    ...over,
  };
}

function room(over: Partial<Room> = {}, q: CurrentQuestion | null = question()): Room {
  return {
    id: 'r1',
    title: '테스트',
    hostAccountId: 'A',
    code: '000000',
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
    bannedAccountIds: new Set(),
    departedScores: new Map(),
    awayTickAt: null,
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

  it('★★ R048 개정 — 초당 3개 연타는 이제 걸린다(5초 5회) · 퀴즈 답 속도(초당 1개)는 안 걸린다', () => {
    // ★ 옛 규칙(Q-84 "서버 보호")은 초당 3개 × 10초를 허용했다. R048(찬종 실플레이)에서 "5초 5회" 로 개정 — D-228
    const r = room();
    let blocked = 0;
    for (let i = 0; i < 30; i += 1) {
      if (checkChatRate(r, 'A', NOW + i * 333, limits) !== null) blocked += 1;
    }
    expect(blocked).toBeGreaterThan(0);
    const r2 = room();
    let blocked2 = 0;
    for (let i = 0; i < 30; i += 1) if (checkChatRate(r2, 'A', NOW + i * 1000, limits) !== null) blocked2 += 1;
    expect(blocked2).toBe(0);
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

// ★★ R048 — 창 + 잠금 (D-228): 5초 5회 · 6번째부터 5초 잠금 · 잠긴 동안 전부 거부 · 풀리면 창을 비워 다시
describe('★★ R048 도배 방지 — 창 + 잠금', () => {
  const limits = { windowMs: 5_000, max: 5, lockMs: 5_000 };
  function fresh(): Room {
    return { chatTimestamps: new Map() } as unknown as Room;
  }
  it('5초 안 5회까지는 허용 · 6번째가 잠근다 (남은 시간 = 잠금 길이)', () => {
    const r = fresh();
    for (let i = 0; i < 5; i += 1) expect(checkChatRate(r, 'A', NOW + i * 100, limits)).toBeNull();
    expect(checkChatRate(r, 'A', NOW + 500, limits)).toBe(5_000);
  });
  it('★ 잠긴 동안은 전부 거부 · 남은 시간이 줄어든다', () => {
    const r = fresh();
    for (let i = 0; i < 6; i += 1) checkChatRate(r, 'A', NOW, limits);
    expect(checkChatRate(r, 'A', NOW + 1_000, limits)).toBe(4_000);
    expect(checkChatRate(r, 'A', NOW + 4_999, limits)).toBe(1);
  });
  it('★★ 잠금이 풀리면 창을 비워 다시 5회부터 센다', () => {
    const r = fresh();
    for (let i = 0; i < 6; i += 1) checkChatRate(r, 'A', NOW, limits);
    expect(checkChatRate(r, 'A', NOW + 5_000, limits)).toBeNull();
    for (let i = 1; i < 5; i += 1) expect(checkChatRate(r, 'A', NOW + 5_000 + i, limits)).toBeNull();
    expect(checkChatRate(r, 'A', NOW + 5_010, limits)).toBe(5_000);
  });
  it('★★ 퀴즈 답 속도(초당 1개 · 60초)는 한 번도 걸리지 않는다', () => {
    const r = fresh();
    let blocked = 0;
    for (let i = 0; i < 60; i += 1) if (checkChatRate(r, 'A', NOW + i * 1_000, limits) !== null) blocked += 1;
    expect(blocked).toBe(0);
  });
  it('★ 계정별로 따로 잠긴다 · 이모티콘은 채팅과 따로', () => {
    const r = fresh();
    for (let i = 0; i < 6; i += 1) checkChatRate(r, 'A', NOW, limits);
    expect(checkChatRate(r, 'B', NOW, limits)).toBeNull();
    expect(checkEmojiRate(r, 'A', NOW, limits)).toBeNull();
  });
  it('★★ R066 (D-273) 특별 이모티콘 — RULES 값 = 5초 5회 · 6번째 잠금 5초 · 5초 뒤 다시', () => {
    const sp = { windowMs: RULES.SPECIAL_EMOJI_RATE_WINDOW_MS, max: RULES.SPECIAL_EMOJI_RATE_MAX, lockMs: RULES.SPECIAL_EMOJI_RATE_LOCK_MS };
    expect(sp).toEqual({ windowMs: 5_000, max: 5, lockMs: 5_000 });
    const r = fresh();
    for (let i = 0; i < 5; i += 1) expect(checkSpecialEmojiRate(r, 'A', NOW + i * 100, sp)).toBeNull();
    expect(checkSpecialEmojiRate(r, 'A', NOW + 500, sp)).toBe(5_000);
    expect(checkSpecialEmojiRate(r, 'A', NOW + 5_500, sp)).toBeNull();
  });
});

// ★★★ R057 (D-251) — 복수정답 유연화: 글자를 지우기만 하는 안전한 변환 넷 · 오타 · 호칭 · 조사는 없다
describe('★★★ 복수정답 유연화 (R057)', () => {
  const withAnswers = (raws: string[]) => {
    const norms = new Set(raws.map((r) => normalizeAnswer(r)));
    return question({ answersRaw: raws, answersNorm: norms, answersFlex: flexAnswerSet(raws, norms) });
  };
  const ok = (raws: string[], text: string) => judgeAnswer(room({}, withAnswers(raws)), player(), { rawText: text, epoch: 3, receivedAt: NOW + 100 }).accepted;

  it('① 괄호와 괄호 안 글자 — 제출 · 정답 둘 다', () => {
    expect(ok(['이순신'], '이순신(李舜臣)')).toBe(true);
    expect(ok(['회계법인(감사 법인)'], '회계법인')).toBe(true);
  });
  it('② 가운뎃점 · 마침표 · 쉼표 · 물결', () => {
    expect(ok(['4·19 혁명'], '4.19혁명')).toBe(true);
    expect(ok(['4·19 혁명'], '419 혁명')).toBe(true);
    expect(ok(['USA'], 'U.S.A.')).toBe(true);
    expect(ok(['1,000'], '1000')).toBe(true);
    // ★ 숫자만인 글의 소수점은 둔다 — "314" 는 "3.14" 가 아니다
    expect(ok(['3.14'], '314')).toBe(false);
  });
  it('③ 끝맺음(이다 · 입니다 · 요 · 임) — 제출 쪽만 · 남은 글 2자 이상', () => {
    expect(ok(['이순신'], '이순신이다')).toBe(true);
    expect(ok(['이순신'], '이순신입니다!')).toBe(true);
    expect(ok(['이순신'], '이순신요')).toBe(true);
    expect(ok(['이순신'], '이순신임')).toBe(true);
    // ★ 정답 쪽에는 쓰지 않는다 — "사이다" 가 "사" 로 맞지 않게
    expect(ok(['사이다'], '사')).toBe(false);
    expect(ok(['오징어 게임'], '오징어 게')).toBe(false);
    // ★ 1자 정답은 끝맺음으로 맞지 않는다
    expect(ok(['수'], '수요')).toBe(false);
  });
  it('④ 영문 관사(the · a · an) — 한글이 없을 때만', () => {
    expect(ok(['The Beatles'], 'Beatles')).toBe(true);
    expect(ok(['Beatles'], 'the beatles')).toBe(true);
  });
  it('★ 넣지 않는 것 — 오타 · 호칭 · 조사', () => {
    expect(ok(['세종'], '세중')).toBe(false);
    expect(ok(['이순신'], '이순신장군')).toBe(false);
    expect(ok(['이순신'], '이순신은')).toBe(false);
  });
  it('★ 경험자는 변환으로 맞아도 판정 제외 그대로', () => {
    const q = withAnswers(['이순신']);
    q.experiencedAccountIds.add('A');
    const r = judgeAnswer(room({}, q), player(), { rawText: '이순신이다', epoch: 3, receivedAt: NOW + 100 });
    expect(r.matched).toBe(true);
    expect(r.rejectReason).toBe('experienced');
  });
});
