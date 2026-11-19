// =============================================================================
// ★ R105 — 정답 인정어로 맞혔을 때의 "무엇으로 맞혔나" 한 줄 (winnerAnswerOf · 공개 때만 실리는지)
// =============================================================================

import { describe, expect, it } from 'vitest';
import { RULES } from '@quiz/shared';
import { winnerAnswerOf } from './answer.js';
import { buildSnapshot } from '../rooms/snapshot.js';
import type { CurrentQuestion, Room } from '../rooms/types.js';

const q = { displayAnswer: '더그아웃', answersRaw: ['더그아웃', '덕아웃', 'Dugout'] };

describe('winnerAnswerOf', () => {
  it('대표 정답으로 맞히면 null', () => {
    expect(winnerAnswerOf(q, '더그아웃')).toBeNull();
  });
  it('띄어쓰기 · 대소문자 · 특수문자만 다르면 null', () => {
    expect(winnerAnswerOf(q, ' 더그 아웃 ')).toBeNull();
    expect(winnerAnswerOf(q, '더그아웃!')).toBeNull();
    expect(winnerAnswerOf({ displayAnswer: 'New York', answersRaw: ['New York', '뉴욕'] }, 'newyork')).toBeNull();
  });
  it('정답 인정어로 맞히면 DB 표기 그대로', () => {
    expect(winnerAnswerOf(q, '덕아웃')).toBe('덕아웃');
    expect(winnerAnswerOf(q, ' du gout ')).toBe('Dugout');
  });
  it('느슨한 견줌(끝맺음)으로 맞혀도 그 인정어 표기', () => {
    expect(winnerAnswerOf(q, '덕아웃입니다')).toBe('덕아웃');
  });
  it('인정어를 못 찾으면 친 글자 그대로(20자에서 자름)', () => {
    const long = { displayAnswer: '가', answersRaw: ['가'] };
    expect(winnerAnswerOf(long, '  가나다라마바사아자차카타파하가나다라마바사  ')).toBe('가나다라마바사아자차카타파하가나다라마바');
  });
});

const NOW = Date.now();

function cq(): CurrentQuestion {
  return {
    epoch: 3, index: 1, questionId: '10', text: '야구장에서 선수들이 대기하는 곳은?', categoryName: '스포츠',
    answersNorm: new Set(['더그아웃', '덕아웃']), displayAnswer: '더그아웃', answersRaw: ['더그아웃', '덕아웃'],
    hint: 'ㄷㄱㅇㅇ', hintPushed: false, generalHint: null, generalHintPushed: false, explanation: null,
    experiencedAccountIds: new Set(), startedAt: NOW, endsAt: NOW + RULES.QUESTION_DURATION_MS, resolved: false,
    skipVotes: new Set(), selectionStage: 1, winnerArrivedNs: null, lateAnswers: [],
  };
}

function room(state: string): Room {
  return {
    id: 'r1', title: '테스트', hostAccountId: 'A', code: '000000', createdBy: 'A', createdAt: NOW, state,
    players: new Map([['A', { accountId: 'A', nickname: '가', colorIndex: 0, joinOrder: 0, connected: true, socketId: 's1', disconnectedAt: null, score: 0, awayMs: 0, team: null, avatarV: null }]]),
    nextJoinOrder: 1, settings: { questionCount: 3, startMode: 'instant', countdownSec: 5 }, settingsLocked: true,
    countdownEndsAt: null, startingGame: false, availableQuestionCount: 10, experienceRates: null, lastGameSettings: null,
    chat: [], hostGraceUntil: null, emptySince: null, bannedAccountIds: new Set(), departedScores: new Map(), awayTickAt: null,
    game: {
      gameId: null, totalQuestions: 3, questionIndex: 1, epoch: 3,
      // ★ 일부러 낡은 공개 정보를 남겨 둔다 — 상태가 공개가 아니면 실리면 안 된다
      resolution: { epoch: 3, reason: 'correct', winnerAccountId: 'A', displayAnswer: '더그아웃', winnerAnswer: '덕아웃', explanation: null, nextAt: NOW + 8000 },
    },
    currentQuestion: cq(), result: null, paused: null, chatTimestamps: new Map(),
  } as unknown as Room;
}

describe('★ winnerAnswer 는 공개 뒤에만 스냅샷에 실린다', () => {
  it('공개(QUESTION_RESOLVED) — 실린다', () => {
    const s = buildSnapshot(room('QUESTION_RESOLVED'), 'A', 'join' as never, 1);
    expect(s.resolution?.winnerAnswer).toBe('덕아웃');
  });
  it('진행 중(QUESTION_ACTIVE) · 일시정지 — 다시 접속 · 관전 스냅샷 어디에도 없다', () => {
    for (const st of ['QUESTION_ACTIVE', 'PAUSED']) {
      const s = buildSnapshot(room(st), 'A', 'join' as never, 1);
      expect(s.resolution).toBeNull();
      expect(JSON.stringify(s)).not.toContain('덕아웃');
    }
  });
});
