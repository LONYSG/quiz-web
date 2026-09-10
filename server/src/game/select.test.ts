// =============================================================================
// 문제 선정 3단계 알고리즘 테스트 (Phase 3 / Q-20 / Q-76)
//
// ★★ 이 파일이 검증하는 규칙 — 하나라도 깨지면 게임 규칙이 깨진다
//   (1) ★ 경험 규칙에는 예외가 없다. 전원이 경험한 문제는 어떤 단계에서도 나오지 않는다
//   (2) ★ 1단계는 전원 미경험 AND 정답 미사용
//   (3) ★ 2단계는 1명 이상 미경험 AND 정답 미사용
//   (4) ★★ 3단계는 정답 중복을 허용한다. **경험 조건은 유지한다** (D-054)
//   (5) ★ 같은 문제를 두 번 내지 않는다 (guide 20절)
//   (6) ★ 정답 비교는 **복수 정답 배열 전체**의 교집합이다 (D-054)
//
// ★ 순수 함수이므로 DB 도 소켓도 필요 없다. 그것이 별도 모듈로 분리한 이유다 (Q-20).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { remainingQuestionCount, selectNextQuestion } from './select.js';
import type { PoolQuestion } from '../db/questionPool.js';

function q(id: string, answers: string[]): PoolQuestion {
  return {
    id,
    text: `문제 ${id}`,
    categoryName: '테스트',
    displayAnswer: answers[0] ?? '',
    hintAnswer: null,
    explanation: null,
    answersNorm: answers,
    answersRaw: answers,
  };
}

/** 항상 첫 번째를 고르는 난수. ★ 무작위성을 제거해 결정적으로 테스트한다 */
const first = () => 0;

function input(over: Partial<Parameters<typeof selectNextQuestion>[0]> = {}) {
  return {
    pool: [] as PoolQuestion[],
    usedQuestionIds: new Set<string>(),
    usedAnswerNorms: new Set<string>(),
    participantIds: ['A', 'B'],
    experienced: new Map<string, Set<string>>([
      ['A', new Set()],
      ['B', new Set()],
    ]),
    random: first,
    ...over,
  };
}

describe('1단계 — 전원 미경험 AND 정답 미사용', () => {
  it('전원이 미경험이면 1단계에서 고른다', () => {
    const r = selectNextQuestion(input({ pool: [q('1', ['가'])] }));
    expect(r?.stage).toBe(1);
    expect(r?.question.id).toBe('1');
    expect(r?.unexperiencedCount).toBe(2);
    expect(r?.experiencedAccountIds.size).toBe(0);
  });

  it('★ 한 명이라도 경험했으면 1단계가 아니다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['가'])],
        experienced: new Map([
          ['A', new Set(['1'])],
          ['B', new Set()],
        ]),
      }),
    );
    expect(r?.stage).toBe(2);
    expect(r?.unexperiencedCount).toBe(1);
    expect([...(r?.experiencedAccountIds ?? [])]).toEqual(['A']);
  });

  it('★ 정답이 이미 쓰였으면 1단계가 아니다 (Q-76)', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['가'])],
        usedAnswerNorms: new Set(['가']),
      }),
    );
    // ★ 전원 미경험이지만 정답이 겹쳐 1·2단계에서 빠지고 3단계로 내려간다
    expect(r?.stage).toBe(3);
  });

  it('★ 1단계 후보가 있으면 2단계 후보를 보지 않는다', () => {
    const r = selectNextQuestion(
      input({
        // pool 순서상 경험된 문제가 먼저 온다
        pool: [q('exp', ['가']), q('fresh', ['나'])],
        experienced: new Map([
          ['A', new Set(['exp'])],
          ['B', new Set()],
        ]),
      }),
    );
    expect(r?.stage).toBe(1);
    expect(r?.question.id).toBe('fresh');
  });
});

describe('★★ 경험 규칙에는 예외가 없다', () => {
  it('★★ 전원이 경험한 문제는 어떤 단계에서도 나오지 않는다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['가'])],
        experienced: new Map([
          ['A', new Set(['1'])],
          ['B', new Set(['1'])],
        ]),
      }),
    );
    // ★ 3단계도 "1명 이상 미경험" 조건을 유지한다. 그래서 null 이다
    expect(r).toBeNull();
  });

  it('★ 정답 중복을 허용해도 경험 조건은 풀지 않는다 (D-054)', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('allexp', ['가'])],
        usedAnswerNorms: new Set(['가']),
        experienced: new Map([
          ['A', new Set(['allexp'])],
          ['B', new Set(['allexp'])],
        ]),
      }),
    );
    expect(r).toBeNull();
  });

  it('전원 경험 문제와 일부 경험 문제가 섞여 있으면 후자를 고른다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('allexp', ['가']), q('partial', ['나'])],
        experienced: new Map([
          ['A', new Set(['allexp', 'partial'])],
          ['B', new Set(['allexp'])],
        ]),
      }),
    );
    expect(r?.question.id).toBe('partial');
    expect(r?.stage).toBe(2);
  });
});

describe('★★ 3단계 — 정답 중복 허용 (Q-76 / D-054)', () => {
  it('★ 정답 미사용 후보가 없으면 3단계로 내려간다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['포르투갈어'])],
        usedAnswerNorms: new Set(['포르투갈어']),
      }),
    );
    expect(r?.stage).toBe(3);
    expect(r?.question.id).toBe('1');
  });

  it('★★ 정답 미사용 후보가 있으면 3단계로 내려가지 않는다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('dup', ['포르투갈어']), q('new', ['스페인어'])],
        usedAnswerNorms: new Set(['포르투갈어']),
      }),
    );
    expect(r?.stage).toBe(1);
    expect(r?.question.id).toBe('new');
  });

  it('★★ 정답 비교는 복수 정답 배열 전체의 교집합이다 (대표 정답만 보지 않는다)', () => {
    // ★ 실측 근거: R012 에서 "카를 대제" 와 "카롤루스 대제" 가 갈렸다.
    //   ★ 대표 정답만 비교하면 이 둘을 다른 정답으로 본다. 플레이어에게는 같은 답이다.
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['카를대제', '카롤루스대제'])],
        // ★ 대표 정답(카를대제)이 아니라 **두 번째 표기**가 이미 쓰였다
        usedAnswerNorms: new Set(['카롤루스대제']),
      }),
    );
    // ★ 교집합이 비어 있지 않으므로 중복으로 본다 → 3단계
    expect(r?.stage).toBe(3);
  });

  it('교집합이 비어 있으면 중복이 아니다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['가', '나'])],
        usedAnswerNorms: new Set(['다', '라']),
      }),
    );
    expect(r?.stage).toBe(1);
  });
});

describe('★ 같은 문제를 두 번 내지 않는다 (guide 20절)', () => {
  it('이미 출제한 문제는 후보에서 빠진다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('used', ['가']), q('fresh', ['나'])],
        usedQuestionIds: new Set(['used']),
      }),
    );
    expect(r?.question.id).toBe('fresh');
  });

  it('★ 이미 출제한 문제뿐이면 정답 중복을 허용해도 null 이다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('used', ['가'])],
        usedQuestionIds: new Set(['used']),
      }),
    );
    expect(r).toBeNull();
  });
});

describe('미경험자 수 가중 무작위 (Q-20)', () => {
  it('★ 미경험자가 많은 문제가 먼저 나올 확률이 높다', () => {
    // 참가자 4명. q3 은 3명 미경험, q1 은 1명 미경험 → 가중치 3 : 1
    const pool = [q('q1', ['가']), q('q3', ['나'])];
    const experienced = new Map<string, Set<string>>([
      ['A', new Set(['q1'])],
      ['B', new Set(['q1'])],
      ['C', new Set(['q1', 'q3'])],
      ['D', new Set()],
    ]);
    // ★ random 을 0 으로 고정하면 첫 후보(가중 구간의 처음)가 나온다.
    //   ★ 가중 구간의 순서는 pool 순서이므로 q1 이 먼저다
    const r0 = selectNextQuestion({
      pool,
      usedQuestionIds: new Set(),
      usedAnswerNorms: new Set(),
      participantIds: ['A', 'B', 'C', 'D'],
      experienced,
      random: () => 0,
    });
    expect(r0?.question.id).toBe('q1');
    expect(r0?.unexperiencedCount).toBe(1);

    // ★ random 을 0.5 로 하면 누적 가중치 절반 지점 → q3 구간이다 (1 + 3 = 4, 0.5*4 = 2)
    const r1 = selectNextQuestion({
      pool,
      usedQuestionIds: new Set(),
      usedAnswerNorms: new Set(),
      participantIds: ['A', 'B', 'C', 'D'],
      experienced,
      random: () => 0.5,
    });
    expect(r1?.question.id).toBe('q3');
    expect(r1?.unexperiencedCount).toBe(3);
  });

  it('★ 통계적으로 가중이 실제로 작동한다', () => {
    // ★★ 두 후보가 **모두 2단계**에 있어야 가중이 작동한다.
    //   ★ 하나라도 "전원 미경험" 이면 그것만 1단계 후보가 되고 균등 선택이 된다.
    //     ★ 실제로 처음 쓴 테스트가 그 함정에 빠졌다 — high 가 1000/1000 나왔다.
    //   → 두 문제 모두 최소 한 명이 경험하게 만든다.
    const pool = [q('low', ['가']), q('high', ['나'])];
    const experienced = new Map<string, Set<string>>([
      ['A', new Set(['low', 'high'])], // ★ A 가 둘 다 경험 → 둘 다 1단계에서 빠진다
      ['B', new Set(['low'])],
      ['C', new Set(['low'])],
      ['D', new Set()],
    ]);
    // low 미경험 = D → 1 / high 미경험 = B, C, D → 3. 가중치 1 : 3
    let high = 0;
    for (let i = 0; i < 2000; i += 1) {
      const r = selectNextQuestion({
        pool,
        usedQuestionIds: new Set(),
        usedAnswerNorms: new Set(),
        participantIds: ['A', 'B', 'C', 'D'],
        experienced,
        random: Math.random,
      });
      expect(r?.stage).toBe(2);
      if (r?.question.id === 'high') high += 1;
    }
    // 기대 1500회 (75%). ★ 넉넉한 구간으로 본다 (난수 흔들림)
    expect(high).toBeGreaterThan(1400);
    expect(high).toBeLessThan(1600);
  });
});

describe('경계', () => {
  it('빈 풀이면 null', () => {
    expect(selectNextQuestion(input())).toBeNull();
  });

  it('★ 참가자가 없으면 null (미경험자 수가 0이 된다)', () => {
    const r = selectNextQuestion(
      input({ pool: [q('1', ['가'])], participantIds: [], experienced: new Map() }),
    );
    expect(r).toBeNull();
  });

  it('경험 기록이 아예 없는 계정도 미경험으로 센다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['가'])],
        participantIds: ['A', 'B', 'NEW'],
        // ★ NEW 는 Map 에 없다. 중간 참가자의 로드가 끝나기 전 상태다
        experienced: new Map([
          ['A', new Set()],
          ['B', new Set()],
        ]),
      }),
    );
    expect(r?.stage).toBe(1);
    expect(r?.unexperiencedCount).toBe(3);
  });
});

describe('remainingQuestionCount — 조기 종료 판정 (Q-22)', () => {
  it('출제 가능 수를 센다', () => {
    const n = remainingQuestionCount({
      pool: [q('1', ['가']), q('2', ['나']), q('3', ['다'])],
      usedQuestionIds: new Set(['1']),
      usedAnswerNorms: new Set(),
      participantIds: ['A'],
      experienced: new Map([['A', new Set(['2'])]]),
    });
    // 1 은 출제됨, 2 는 A 가 경험 → 3 만 남는다
    expect(n).toBe(1);
  });

  it('★ 정답 중복은 세지 않는다. 3단계가 허용하므로 "남아 있는가" 의 기준이 아니다', () => {
    const n = remainingQuestionCount({
      pool: [q('1', ['가'])],
      usedQuestionIds: new Set(),
      usedAnswerNorms: new Set(['가']),
      participantIds: ['A'],
      experienced: new Map([['A', new Set()]]),
    });
    expect(n).toBe(1);
  });
});
