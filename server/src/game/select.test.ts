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
import { gradeOrder, remainingQuestionCount, selectNextQuestion, worthFactor } from './select.js';
import type { PoolQuestion } from '../db/questionPool.js';

function q(id: string, answers: string[], grade = 3, worth: number | null = null): PoolQuestion {
  return {
    id,
    text: `문제 ${id}`,
    categoryName: '테스트',
    displayAnswer: answers[0] ?? '',
    hintAnswer: null,
    generalHint: null,
    explanation: null,
    answersNorm: answers,
    answersRaw: answers,
    grade,
    worth,
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

// ─────────────────────────────────────────────────────────────────────────────
// ★★ R050 (C66 · D-233) — 서로의 정답 흘림: 이미 보여 준 글에 정답이 들어 있는 후보는 같은 단계 안에서 뒤로
// ─────────────────────────────────────────────────────────────────────────────
describe('R050 — 정답 흘림 (shownNorm)', () => {
  it('★ 1단계 안에서 흘림 없는 후보를 먼저 고른다', () => {
    const r = selectNextQuestion(
      input({ pool: [q('1', ['훈민정음']), q('2', ['안도라'])], shownNorm: '세종대왕이창제한문자는무엇인가훈민정음해례본' }),
    );
    expect(r?.question.id).toBe('2');
    expect(r?.stage).toBe(1);
  });

  it('★ 흘림 있는 후보만 남으면 그것을 낸다 (조기 종료를 늘리지 않는다)', () => {
    const r = selectNextQuestion(input({ pool: [q('1', ['훈민정음'])], shownNorm: '훈민정음' }));
    expect(r?.question.id).toBe('1');
    expect(r?.stage).toBe(1);
  });

  it('★ 단계 순서가 먼저다 — 1단계의 흘림 후보가 2단계의 깨끗한 후보보다 앞선다', () => {
    const r = selectNextQuestion(
      input({
        pool: [q('1', ['훈민정음']), q('2', ['안도라'])],
        experienced: new Map([
          ['A', new Set(['2'])],
          ['B', new Set<string>()],
        ]),
        shownNorm: '훈민정음',
      }),
    );
    expect(r?.question.id).toBe('1');
    expect(r?.stage).toBe(1);
  });

  it('★ 복수 정답 중 하나만 들어 있어도 흘림이다', () => {
    const r = selectNextQuestion(
      input({ pool: [q('1', ['알렉산더플레밍', '플레밍']), q('2', ['페니실린'])], shownNorm: '플레밍이발견한항생물질' }),
    );
    expect(r?.question.id).toBe('2');
  });

  it('★ 2글자 이하 정답은 흘림으로 보지 않는다 (우연 포함)', () => {
    const r = selectNextQuestion(input({ pool: [q('1', ['밤']), q('2', ['안도라'])], shownNorm: '밤하늘' }));
    expect(r?.question.id).toBe('1');
  });

  it('★ shownNorm 이 없으면 규칙이 꺼진다 (옛 호출)', () => {
    const r = selectNextQuestion(input({ pool: [q('1', ['훈민정음']), q('2', ['안도라'])] }));
    expect(r?.question.id).toBe('1');
  });

  it('★ 2 · 3단계 안에서도 같다', () => {
    const exp = new Map([
      ['A', new Set(['1', '2'])],
      ['B', new Set<string>()],
    ]);
    const r2 = selectNextQuestion(input({ pool: [q('1', ['훈민정음']), q('2', ['안도라'])], experienced: exp, shownNorm: '훈민정음' }));
    expect(r2?.question.id).toBe('2');
    expect(r2?.stage).toBe(2);
    const r3 = selectNextQuestion(
      input({ pool: [q('1', ['훈민정음']), q('2', ['안도라'])], experienced: exp, usedAnswerNorms: new Set(['훈민정음', '안도라']), shownNorm: '훈민정음' }),
    );
    expect(r3?.question.id).toBe('2');
    expect(r3?.stage).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ R069 — 등급 계획 · 알가치 가중 · 가장 어려운 칸 · 등급 폴백 (docs/19 §5)
// ─────────────────────────────────────────────────────────────────────────────
describe('★★★ R069 등급 · 알가치', () => {
  const ADV = { hardestGrade: 5, levelScores: [1, 2, 3, 4, 5] };
  const MID = { hardestGrade: 4, levelScores: [1, 2, 3, 4] };
  /** 같은 입력을 여러 난수로 돌려 나온 문제 id 집합 */
  const picks = (over: Partial<Parameters<typeof selectNextQuestion>[0]>, n = 60) => {
    const out = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      const r = selectNextQuestion(input({ ...over, random: () => (i + 0.5) / n }));
      if (r) out.add(r.question.id);
    }
    return out;
  };

  it('★ worthFactor — 3 ×2 · 2 · null ×1 · 1 예비(0) · gradeOrder 아래 먼저', () => {
    expect([worthFactor(3), worthFactor(2), worthFactor(null), worthFactor(1)]).toEqual([2, 1, 1, 0]);
    expect(gradeOrder(3, [1, 2, 3, 4, 5])).toEqual([3, 2, 1, 4, 5]);
    expect(gradeOrder(1, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(gradeOrder(5, [1, 2, 3, 4, 5])).toEqual([5, 4, 3, 2, 1]);
  });

  it('★★ 목표 등급의 문제만 나온다(있을 때)', () => {
    const pool = [q('a', ['a'], 2), q('b', ['b'], 3), q('c', ['c'], 3), q('d', ['d'], 4)];
    expect(picks({ pool, targetGrade: 3, ...MID })).toEqual(new Set(['b', 'c']));
    const r = selectNextQuestion(input({ pool, targetGrade: 3, ...MID }));
    expect(r?.gradeFallback).toBe(false);
    expect(r?.targetGrade).toBe(3);
  });

  it('★★★ 가장 어려운 칸 — 알가치 3 만 · 없으면 2(null 포함) · 그것도 없으면 한 등급 아래', () => {
    const p1 = [q('w3', ['x1'], 5, 3), q('w2', ['x2'], 5, 2), q('wn', ['x3'], 5, null), q('w1', ['x4'], 5, 1), q('m3', ['x5'], 4, 3)];
    expect(picks({ pool: p1, targetGrade: 5, ...ADV })).toEqual(new Set(['w3']));
    const p2 = p1.filter((x) => x.id !== 'w3');
    expect(picks({ pool: p2, targetGrade: 5, ...ADV })).toEqual(new Set(['w2', 'wn']));
    const r2 = selectNextQuestion(input({ pool: p2, targetGrade: 5, ...ADV }));
    expect(r2?.worthFallback).toBe(true);
    expect(r2?.gradeFallback).toBe(false);
    const p3 = [q('w1', ['x4'], 5, 1), q('m3', ['x5'], 4, 3), q('m2', ['x6'], 4, 2)];
    expect(picks({ pool: p3, targetGrade: 5, ...ADV })).toEqual(new Set(['m3']));
    const r3 = selectNextQuestion(input({ pool: p3, targetGrade: 5, ...ADV }));
    expect(r3?.gradeFallback).toBe(true);
    expect(r3?.question.grade).toBe(4);
  });

  it('★★ 가장 어려운 칸 — 알가치 1 은 넣지 않는다(다른 등급에 3·2 가 있으면 그쪽) · 정말 그것뿐이면 마지막에', () => {
    const p = [q('h1', ['y1'], 5, 1), q('k1', ['y2'], 4, 1), q('t2', ['y3'], 3, 2)];
    expect(picks({ pool: p, targetGrade: 5, ...ADV })).toEqual(new Set(['t2']));
    expect(picks({ pool: [q('h1', ['y1'], 5, 1)], targetGrade: 5, ...ADV })).toEqual(new Set(['h1']));
  });

  it('★★ 나머지 칸 — 알가치 3 이 2 보다 두 배 · 1 은 예비(3·2 가 없을 때만)', () => {
    const pool = [q('t3', ['z1'], 3, 3), q('t2', ['z2'], 3, 2), q('t1', ['z3'], 3, 1)];
    let n3 = 0;
    let n2 = 0;
    let n1 = 0;
    for (let i = 0; i < 300; i += 1) {
      const r = selectNextQuestion(input({ pool, targetGrade: 3, ...MID, random: () => (i + 0.5) / 300 }));
      if (r?.question.id === 't3') n3 += 1;
      else if (r?.question.id === 't2') n2 += 1;
      else n1 += 1;
    }
    expect(n1).toBe(0);
    expect(n3).toBe(200);
    expect(n2).toBe(100);
    expect(picks({ pool: [q('t1', ['z3'], 3, 1), q('u2', ['z4'], 2, 2)], targetGrade: 3, ...MID })).toEqual(new Set(['t1']));
  });

  it('★★ null(판정 전)은 2 로 친다', () => {
    const pool = [q('n', ['n1'], 3, null), q('two', ['n2'], 3, 2)];
    expect(picks({ pool, targetGrade: 3, ...MID })).toEqual(new Set(['n', 'two']));
    expect(picks({ pool: [q('n', ['n1'], 4, null), q('one', ['n3'], 4, 1)], targetGrade: 4, ...MID })).toEqual(new Set(['n']));
  });

  it('★★ 등급 폴백 — 아래 먼저 · 그다음 위 · 단계가 읽는 등급 안에서', () => {
    expect(picks({ pool: [q('g1', ['p1'], 1), q('g4', ['p4'], 4)], targetGrade: 2, ...MID })).toEqual(new Set(['g1']));
    expect(picks({ pool: [q('g4', ['p4'], 4), q('g3', ['p3'], 3)], targetGrade: 1, ...MID })).toEqual(new Set(['g3']));
    const r = selectNextQuestion(input({ pool: [q('g3', ['p3'], 3)], targetGrade: 1, ...MID }));
    expect(r?.gradeFallback).toBe(true);
  });

  it('★★★ 경험 단계가 등급보다 먼저 — 전원 미경험인 다른 등급 > 일부가 본 목표 등급', () => {
    const exp = new Map([
      ['A', new Set(['tgt'])],
      ['B', new Set<string>()],
    ]);
    const r = selectNextQuestion(input({ pool: [q('tgt', ['k1'], 3, 3), q('other', ['k2'], 1, 2)], experienced: exp, targetGrade: 3, ...MID }));
    expect(r?.question.id).toBe('other');
    expect(r?.stage).toBe(1);
    expect(r?.gradeFallback).toBe(true);
  });

  it('★★ 정답 중복 · 흘림 규칙 그대로(등급 규칙 위에서)', () => {
    const r = selectNextQuestion(input({ pool: [q('dup', ['같음'], 3, 3), q('ok', ['다름'], 2, 1)], usedAnswerNorms: new Set(['같음']), targetGrade: 3, ...MID }));
    expect(r?.question.id).toBe('ok');
    expect(r?.stage).toBe(1);
    const l = selectNextQuestion(input({ pool: [q('leak', ['훈민정음'], 3, 3), q('safe', ['안도라'], 1, 1)], shownNorm: '훈민정음', targetGrade: 3, ...MID }));
    expect(l?.question.id).toBe('safe');
  });

  it('★ 목표 등급이 없으면 옛 동작(등급 · 알가치를 보지 않는다)', () => {
    const r = selectNextQuestion(input({ pool: [q('1', ['가'], 5, 1), q('2', ['나'], 1, 3)] }));
    expect(r?.question.id).toBe('1');
    expect(r?.targetGrade).toBe(null);
  });
});
