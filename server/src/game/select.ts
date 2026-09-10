// =============================================================================
// 문제 선정 (Phase 3 / Q-20 / Q-76)
//
// ★★ 왜 별도 모듈인가 (Q-20 확정)
//   "선정 로직을 교체 가능한 모듈로 분리하라" 가 확정 조건이다.
//   ★ 근거: 경험 규칙(Phase 6)과 정답 중복 금지(Q-76)가 둘 다 선정 조건이고,
//     앞으로 난이도 분포나 카테고리 균형이 조건에 더해질 수 있다.
//   ★ 그래서 이 파일의 함수는 **순수 함수**다. Room 을 받지 않고 입력만 받는다.
//     ★ 그러면 단위 테스트로 전 경로를 검증할 수 있다. DB 도 소켓도 필요 없다.
//
// ★★★ 이 함수 안에 await 가 없다. 그것이 설계다.
//   문제 시작 절차는 30초 타이머가 시작되기 전에 끝나야 하고,
//   tick 에서도 호출된다(다음 문제). ★ 전부 메모리 연산이다.
// =============================================================================

import type { PoolQuestion } from '../db/questionPool.js';

/** 선정이 성공한 단계. game_questions.selection_stage 에 기록한다 */
export type SelectionStage = 1 | 2 | 3;

export interface SelectInput {
  /** 출제 대상 전체 (게임 시작 때 한 번 읽어 둔 것) */
  pool: readonly PoolQuestion[];
  /** 이 게임에서 이미 출제한 문제 id */
  usedQuestionIds: ReadonlySet<string>;
  /** ★ 이 게임에서 이미 쓴 정규화 정답 (Q-76) */
  usedAnswerNorms: ReadonlySet<string>;
  /** 현재 참가자의 계정 id. ★ 접속 여부와 무관하다 (슬롯을 가진 사람 전원) */
  participantIds: readonly string[];
  /** 계정 → 경험한 문제 id 집합 */
  experienced: ReadonlyMap<string, ReadonlySet<string>>;
  /** 0~1 난수. 테스트에서 고정할 수 있게 주입받는다 */
  random?: () => number;
}

export interface SelectResult {
  question: PoolQuestion;
  stage: SelectionStage;
  /** 이 문제를 이미 경험한 참가자. 배지·마스킹에 쓴다 */
  experiencedAccountIds: Set<string>;
  /** 미경험자 수. 가중 무작위의 가중치였던 값. 로그와 테스트에 쓴다 */
  unexperiencedCount: number;
}

/**
 * ★ 이 문제를 경험하지 않은 참가자 수.
 *
 * ★ 참가자가 0명이면 0이다. 그 경우 어떤 단계도 통과하지 못한다.
 *   ★ 활성 0명인 방에서 문제를 시작하지 않는 것은 호출자의 책임이다(T20/T04 조건).
 */
function countUnexperienced(
  q: PoolQuestion,
  participantIds: readonly string[],
  experienced: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  let n = 0;
  for (const id of participantIds) {
    if (!experienced.get(id)?.has(q.id)) n += 1;
  }
  return n;
}

/** ★ 이 문제의 정답이 이미 쓰인 것과 겹치는가 (Q-76). 교집합이 비어 있지 않으면 겹친다 */
function answerCollides(q: PoolQuestion, usedAnswerNorms: ReadonlySet<string>): boolean {
  for (const norm of q.answersNorm) {
    if (usedAnswerNorms.has(norm)) return true;
  }
  return false;
}

/**
 * 미경험자 수로 가중한 무작위 선택.
 *
 * ★ 왜 가중인가 (Q-20 확정) — 더 많은 사람이 처음 보는 문제를 먼저 낸다.
 *   ★ 균등 무작위로 하면 9명이 이미 아는 문제와 아무도 모르는 문제가 같은 확률로 나온다.
 */
function weightedPick<T extends { weight: number }>(items: readonly T[], random: () => number): T {
  let total = 0;
  for (const i of items) total += i.weight;
  // ★ 가중치 합이 0이면 균등으로 떨어진다. 방어적으로 둔다
  if (total <= 0) return items[Math.floor(random() * items.length)] ?? items[0]!;
  let r = random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i;
  }
  return items[items.length - 1]!;
}

/**
 * ★★ 다음 문제를 고른다. 3단계 알고리즘 (04-PROTOCOL 3장 / D-054).
 *
 * ```
 * 1단계  전원 미경험 AND 정답 미사용        → 무작위
 * 2단계  1명 이상 미경험 AND 정답 미사용     → 미경험자 수 가중 무작위
 * 3단계  ★ 1명 이상 미경험 (정답 중복 허용)  → 미경험자 수 가중 무작위
 *        셋 다 비면 null → 조기 종료 (no_questions)
 * ```
 *
 * ★★ 경험 규칙이 정답 중복 금지보다 우선한다 (D-054).
 *   3단계에서도 "1명 이상 미경험" 조건은 유지된다.
 *   ★ 경험 규칙에는 예외를 만들지 않는다. 정답 중복 금지에만 예외를 둔다.
 *   ★ 근거: 경험 규칙 위반은 "이미 아는 문제가 또 나온다" 이고
 *     정답 중복은 "비슷한 게 나왔다" 다. 전자가 더 큰 불만이다.
 *
 * @returns 고른 문제와 단계. 출제할 수 있는 문제가 없으면 null
 */
export function selectNextQuestion(input: SelectInput): SelectResult | null {
  const random = input.random ?? Math.random;
  const { pool, usedQuestionIds, usedAnswerNorms, participantIds, experienced } = input;

  // ★ 한 번의 순회로 세 후보 집합을 동시에 만든다.
  //   ★ 세 번 순회하면 수천 건에서 낭비다. 조건은 서로 배타적이지 않으므로 함께 담는다.
  const s1: { q: PoolQuestion; weight: number; un: number }[] = [];
  const s2: { q: PoolQuestion; weight: number; un: number }[] = [];
  const s3: { q: PoolQuestion; weight: number; un: number }[] = [];

  for (const q of pool) {
    if (usedQuestionIds.has(q.id)) continue;
    const un = countUnexperienced(q, participantIds, experienced);
    // ★ 전원이 경험한 문제는 어떤 단계에도 들어가지 않는다.
    //   ★ 경험 규칙의 예외를 만들지 않는다 (guide 25·29절의 강한 금지).
    if (un === 0) continue;

    const collides = answerCollides(q, usedAnswerNorms);
    const entry = { q, weight: un, un };
    s3.push(entry);
    if (collides) continue;
    s2.push(entry);
    if (un === participantIds.length) s1.push(entry);
  }

  const finish = (
    picked: { q: PoolQuestion; un: number },
    stage: SelectionStage,
  ): SelectResult => {
    const experiencedAccountIds = new Set<string>();
    for (const id of participantIds) {
      if (experienced.get(id)?.has(picked.q.id)) experiencedAccountIds.add(id);
    }
    return {
      question: picked.q,
      stage,
      experiencedAccountIds,
      unexperiencedCount: picked.un,
    };
  };

  // 1단계 — 전원 미경험. ★ 균등 무작위다 (전원 미경험이므로 가중치가 모두 같다)
  if (s1.length > 0) {
    return finish(s1[Math.floor(random() * s1.length)]!, 1);
  }
  // 2단계 — 1명 이상 미경험 + 정답 미사용
  if (s2.length > 0) {
    return finish(weightedPick(s2, random), 2);
  }
  // ★ 3단계 — 정답 중복을 허용한다 (Q-76)
  if (s3.length > 0) {
    return finish(weightedPick(s3, random), 3);
  }
  return null;
}

/**
 * ★ 지금 출제할 수 있는 문제가 남아 있는가 (개수만).
 *
 * ★ 조기 종료 판정(T16)에 쓴다. selectNextQuestion 을 부르지 않고 알 수 있어야
 *   "다음 문제가 없다" 를 무작위 선택 없이 확인할 수 있다.
 * ★ 정답 중복은 세지 않는다. 3단계가 그것을 허용하므로 "남아 있는가" 의 기준이 아니다.
 */
export function remainingQuestionCount(input: Omit<SelectInput, 'random'>): number {
  let n = 0;
  for (const q of input.pool) {
    if (input.usedQuestionIds.has(q.id)) continue;
    if (countUnexperienced(q, input.participantIds, input.experienced) === 0) continue;
    n += 1;
  }
  return n;
}
