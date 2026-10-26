// =============================================================================
// 문제 선정 (Phase 3 / Q-20 / Q-76)
//
// ★★ 왜 별도 모듈인가 (Q-20 확정)
//   "선정 로직을 교체 가능한 모듈로 분리하라" 가 확정 조건이다.
//   ★★★ R069 (docs/19 §5) — 그 "난이도 분포" 가 더해졌다: 등급 계획(목표 등급) · 알가치 가중 · 가장 어려운 칸 · 등급 폴백.
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
  /**
   * ★★ R050 (C66 · D-233) — 이 판에서 이미 보여 준 문제들의 질문 · 힌트 · 해설을 정답 판정과 같은 함수(normalizeAnswer)로 이은 글.
   *   후보의 정답(정규화 · 길이 3 이상) 중 하나라도 여기 들어 있으면 그 후보는 **같은 단계 안에서 뒤로** 미룬다.
   *   없으면(옛 호출) 규칙이 꺼진다.
   */
  shownNorm?: string;
  /**
   * ★★★ R069 — 이 문항의 목표 등급(game.gradePlan[i]) · 단계의 가장 어려운 등급 · 단계가 읽는 등급들.
   *   없으면(옛 호출 · 테스트) 등급 · 알가치 규칙이 꺼진다(옛 동작 그대로).
   */
  targetGrade?: number;
  hardestGrade?: number;
  levelScores?: readonly number[];
}

/** ★ R050 — 정답 흘림 검사에 쓰는 정답의 최소 길이 (정규화 뒤). 2글자 이하는 우연히 겹치기 쉽다 */
export const LEAK_MIN_ANSWER_LENGTH = 3;

/** ★ R050 — 이 후보의 정답이 이미 보여 준 글에 들어 있는가 (서로의 정답 흘림 — C66) */
export function answerLeaked(q: Pick<PoolQuestion, 'answersNorm'>, shownNorm: string | undefined): boolean {
  if (!shownNorm) return false;
  for (const norm of q.answersNorm) {
    if (norm.length >= LEAK_MIN_ANSWER_LENGTH && shownNorm.includes(norm)) return true;
  }
  return false;
}

export interface SelectResult {
  question: PoolQuestion;
  stage: SelectionStage;
  /** 이 문제를 이미 경험한 참가자. 배지·마스킹에 쓴다 */
  experiencedAccountIds: Set<string>;
  /** 미경험자 수. 가중 무작위의 가중치였던 값. 로그와 테스트에 쓴다 */
  unexperiencedCount: number;
  /** ★ R069 — 목표 등급(없으면 null) · 목표와 다른 등급에서 냈나 · 가장 어려운 칸을 알가치 3 으로 못 채웠나 */
  targetGrade: number | null;
  gradeFallback: boolean;
  worthFallback: boolean;
}

/** ★ R069 — 알가치 가중: 3 → 2 · 2 또는 판정 전(null) → 1 · 1 → 0(예비 — 3·2 가 하나도 없을 때만) */
export function worthFactor(worth: number | null): number {
  if (worth === 3) return 2;
  if (worth === 1) return 0;
  return 1;
}
/** ★ R069 — 등급 폴백 순서: 목표 → 아래로(하나씩) → 그다음 위로 (단계가 읽는 등급 안에서만 · 19 §5 "아래 먼저") */
export function gradeOrder(target: number, scores: readonly number[]): number[] {
  const down = scores.filter((g) => g <= target).sort((a, b) => b - a);
  const up = scores.filter((g) => g > target).sort((a, b) => a - b);
  return [...down, ...up];
}

type Cand = { q: PoolQuestion; weight: number; un: number };

/**
 * ★★★ R069 — 한 후보 집합(같은 경험 단계 · 같은 흘림 여부) 안에서 목표 등급 · 알가치로 하나 고른다.
 *   가장 어려운 칸(target === hardest): ① 그 등급 알가치 3 → ② 2(null) → ③ 한 등급 아래 3 → ④ 2 → ⑤ 그 밖 등급(아래 먼저)은 나머지 칸 규칙
 *     → ⑥ 마지막으로 알가치 1(한 등급 아래 → 그 등급). 알가치 1 은 이 칸에 되도록 넣지 않는다(19 §5).
 *   나머지 칸: 등급 순서(목표 → 아래 → 위)마다 가중 = 미경험자 수 × worthFactor · 그 등급에 3·2 가 없으면 그 등급의 알가치 1(×1) · 없으면 다음 등급.
 *   집합이 비어 있지 않으면 반드시 하나를 돌려준다(풀은 단계가 읽는 등급만 담는다 — 그 밖 등급이 섞여 있어도 끝에서 받는다).
 */
function pickByGrade(
  cands: readonly Cand[],
  target: number,
  hardest: number,
  scores: readonly number[],
  random: () => number,
): { c: Cand; gradeFallback: boolean; worthFallback: boolean } | null {
  if (cands.length === 0) return null;
  const byGrade = new Map<number, Cand[]>();
  for (const c of cands) {
    const arr = byGrade.get(c.q.grade) ?? [];
    arr.push(c);
    byGrade.set(c.q.grade, arr);
  }
  const of = (g: number) => byGrade.get(g) ?? [];
  const pick = (list: readonly Cand[], w: (c: Cand) => number) => weightedPick(list.map((c) => ({ ...c, weight: w(c) })), random);
  const hard = target === hardest;
  if (hard) {
    for (const g of [target, target - 1]) {
      const w3 = of(g).filter((c) => c.q.worth === 3);
      if (w3.length) return { c: pick(w3, (c) => c.un), gradeFallback: g !== target, worthFallback: g !== target };
      const w2 = of(g).filter((c) => c.q.worth !== 1 && c.q.worth !== 3);
      if (w2.length) return { c: pick(w2, (c) => c.un), gradeFallback: g !== target, worthFallback: true };
    }
  }
  const order = gradeOrder(target, scores);
  for (const g of order) {
    if (hard && (g === target || g === target - 1)) continue; // ⑥ 으로 미룬다(알가치 1 만 남았다)
    const main = of(g).filter((c) => worthFactor(c.q.worth) > 0);
    if (main.length) return { c: pick(main, (c) => c.un * worthFactor(c.q.worth)), gradeFallback: g !== target, worthFallback: hard };
    const reserve = of(g);
    if (reserve.length) return { c: pick(reserve, (c) => c.un), gradeFallback: g !== target, worthFallback: hard };
  }
  if (hard) {
    for (const g of [target - 1, target]) {
      const rest = of(g);
      if (rest.length) return { c: pick(rest, (c) => c.un), gradeFallback: g !== target, worthFallback: true };
    }
  }
  // 단계가 읽는 등급 밖(있으면 안 되지만 — 옛 풀 · 테스트) — 그래도 비우지 않는다
  return { c: pick(cands, (c) => c.un * Math.max(1, worthFactor(c.q.worth))), gradeFallback: true, worthFallback: hard };
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
  // ★ R050 — 단계마다 "흘림 없는" 후보(s1 …)와 "흘림 있는" 후보(l1 …)를 따로 담는다. 흘림 없는 쪽을 먼저 쓴다
  const s1: Cand[] = [];
  const s2: Cand[] = [];
  const s3: Cand[] = [];
  const l1: Cand[] = [];
  const l2: Cand[] = [];
  const l3: Cand[] = [];

  for (const q of pool) {
    if (usedQuestionIds.has(q.id)) continue;
    const un = countUnexperienced(q, participantIds, experienced);
    // ★ 전원이 경험한 문제는 어떤 단계에도 들어가지 않는다.
    //   ★ 경험 규칙의 예외를 만들지 않는다 (guide 25·29절의 강한 금지).
    if (un === 0) continue;

    const collides = answerCollides(q, usedAnswerNorms);
    const leaked = answerLeaked(q, input.shownNorm);
    const entry = { q, weight: un, un };
    (leaked ? l3 : s3).push(entry);
    if (collides) continue;
    (leaked ? l2 : s2).push(entry);
    if (un === participantIds.length) (leaked ? l1 : s1).push(entry);
  }

  const finish = (
    picked: { q: PoolQuestion; un: number },
    stage: SelectionStage,
    grade: { gradeFallback: boolean; worthFallback: boolean } = { gradeFallback: false, worthFallback: false },
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
      targetGrade: input.targetGrade ?? null,
      gradeFallback: grade.gradeFallback,
      worthFallback: grade.worthFallback,
    };
  };

  // ★★★ R069 — 목표 등급이 있으면: 경험 단계(1 → 2 → 3)가 등급보다 먼저(04 3장 · D-054) · 단계마다 흘림 없는 쪽 먼저 · 그 안에서 등급 · 알가치
  if (input.targetGrade !== undefined) {
    const target = input.targetGrade;
    const hardest = input.hardestGrade ?? 99;
    const scores = input.levelScores ?? [1, 2, 3, 4, 5];
    const stages: [Cand[], SelectionStage][] = [
      [s1.length > 0 ? s1 : l1, 1],
      [s2.length > 0 ? s2 : l2, 2],
      [s3.length > 0 ? s3 : l3, 3],
    ];
    for (const [list, stage] of stages) {
      const r = pickByGrade(list, target, hardest, scores, random);
      if (r) return finish(r.c, stage, r);
    }
    return null;
  }

  // ★★ R050 — 각 단계 안에서 "흘림 없는 후보" 를 먼저, 없을 때만 흘림 있는 후보 (조기 종료를 늘리지 않는다 — 단계 순서는 그대로)
  // 1단계 — 전원 미경험. ★ 균등 무작위다 (전원 미경험이므로 가중치가 모두 같다)
  const one = s1.length > 0 ? s1 : l1;
  if (one.length > 0) {
    return finish(one[Math.floor(random() * one.length)]!, 1);
  }
  // 2단계 — 1명 이상 미경험 + 정답 미사용
  const two = s2.length > 0 ? s2 : l2;
  if (two.length > 0) {
    return finish(weightedPick(two, random), 2);
  }
  // ★ 3단계 — 정답 중복을 허용한다 (Q-76)
  const three = s3.length > 0 ? s3 : l3;
  if (three.length > 0) {
    return finish(weightedPick(three, random), 3);
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
