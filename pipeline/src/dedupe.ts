// =============================================================================
// 중복 판정 (작업 C-1 판단의 구현 / D-4 / R011)
//
// ★★ 건우가 확정한 원칙
//   · 같은 카테고리 + 같은 정답  → 중복 의심
//   · 다른 카테고리 + 같은 정답  → 대체로 문제없음
//   · 문장을 하나하나 판단하는 것은 비효율 → 카테고리+정답으로 후보를 좁힌다
//
// ★★ 여기서 한 가지를 더 넣었다 — **질문 문장 유사도**.
//   근거: "같은 정답 다른 문제" 를 구분할 방법이 필요하다 (C-1 요구사항).
//     "축구 한 팀의 선수 수는?" → 11
//     "야구 한 팀의 수비 인원은?" → 9
//   둘은 정답이 다르니 애초에 후보가 아니다. 그런데 같은 중분류 안에서
//     "축구 한 팀의 선수는 몇 명인가?" → 11
//     "축구에서 등번호가 없는 포지션 수는?" → 11
//   처럼 정답만 같은 경우가 실제로 많다.
//   ★ 건우의 "문장을 하나하나 판단하는 것은 비효율" 은 **전수 비교**를 말한 것이다.
//     정답으로 후보를 좁힌 뒤 남은 몇 쌍만 문장을 비교하는 것은 비용이 거의 없다.
//     그래서 정답 = 후보 추리기, 카테고리 = 의심 강도, 문장 = 최종 구분으로 나눴다.
//
// ★★ 중복으로 판정한 것을 버리지 않는다 (건우 지시 + R010 교훈).
//   R010에서 내가 만든 판정 로직이 정상 문제 6건을 **전부** 오탈락시켰다.
//   판정 로직은 틀릴 수 있다. 버리면 회복에 토큰이 들고, 남기면 사람이 한 번 보면 된다.
//   ★ 예외: 정규화한 질문까지 완전히 같으면 그것은 판정이 아니라 동일성이다.
//     그 경우만 exact 로 표시해 자동 폐기 후보로 둔다.
// =============================================================================

import { normalizeAnswer } from '@quiz/shared';

export interface DupeInput {
  /** 항목 식별자 (sourceRef) */
  ref: string;
  /** ★ 중복 검사 기준 계층 */
  midKey: string;
  majorKey: string;
  question: string;
  answers: readonly string[];
}

export type DupeLevel = 'exact' | 'same-mid' | 'same-major' | 'cross-major';
export type DupeVerdict = 'duplicate' | 'suspect' | 'ok';

export interface DupePair {
  a: string;
  b: string;
  level: DupeLevel;
  verdict: DupeVerdict;
  /** 겹친 정답 (정규화 전 표기) */
  sharedAnswer: string;
  /** 질문 문장 유사도 0.0~1.0 */
  similarity: number;
  reason: string;
}

export interface DupeReport {
  pairs: DupePair[];
  /** verdict 별 건수 */
  counts: Record<DupeVerdict, number>;
  /** 비교한 쌍의 수 (정답이 겹쳐 후보가 된 쌍만) */
  candidatePairs: number;
  /** 전수 비교했다면 몇 쌍이었는가. 후보 추리기의 효과를 보여준다 */
  totalPairsIfBruteForce: number;
}

/**
 * ★ 질문 동일성 판정용 열쇠.
 *
 * ★ R011 실측에서 이것이 필요해졌다. 다음 두 질문이 "완전 동일" 로 잡히지 않았다 —
 *     '죽는 날까지 하늘을 우러러…'라는 구절로 시작하는 윤동주의 대표 시는?
 *     "죽는 날까지 하늘을 우러러…"라는 구절로 시작하는 윤동주의 대표 시는?
 *   ★ 따옴표 종류만 다르다. normalizeAnswer 는 아포스트로피는 통일하지만
 *     큰따옴표·꺾쇠 같은 문장부호는 남긴다(정답 판정에는 그것이 옳다).
 *   → 질문 비교에서는 **문장부호와 공백을 전부 지운다.**
 *     질문의 문장부호 차이는 문제의 차이가 아니다.
 */
export function questionKey(s: string): string {
  return normalizeAnswer(s).replace(/[^0-9a-zㄱ-힝]/gi, '');
}

/**
 * 문자 2-그램 자카드 유사도.
 *
 * ★ 왜 단어 단위가 아니라 문자 2-그램인가
 *   한국어는 조사가 붙어 단어 경계가 흔들린다.
 *   "한글을 창제한" 과 "한글의 창제자" 는 단어로는 하나도 겹치지 않지만
 *   문자 2-그램으로는 "한글", "창제" 가 겹친다.
 */
export function similarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const t = questionKey(s);
    const out = new Set<string>();
    for (let i = 0; i + 1 < t.length; i += 1) out.add(t.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  return inter / (ga.size + gb.size - inter);
}

/**
 * ★ 임계값. 실측으로 조정할 값이다. 지금은 근거만 적어둔다.
 *
 *   SAME_MID_DUP  같은 중분류에서 이 이상이면 사실상 같은 문제로 본다.
 *   SAME_MID_SUS  같은 중분류 + 같은 정답이면 유사도가 낮아도 의심한다 (건우 원칙).
 *   CROSS_SUS     다른 대분류인데도 문장이 이만큼 닮았으면 카테고리 배정이 잘못된 것이다.
 */
export const DUPE_THRESHOLDS = {
  sameMidDuplicate: 0.55,
  sameMajorSuspect: 0.45,
  crossMajorSuspect: 0.7,
} as const;

export function findDuplicates(items: readonly DupeInput[]): DupeReport {
  // ── 1. 정규화한 정답으로 역색인을 만든다. ★ 이것이 후보 추리기다
  const index = new Map<string, { ref: string; raw: string }[]>();
  for (const it of items) {
    const seen = new Set<string>();
    for (const a of it.answers) {
      const n = normalizeAnswer(a);
      if (n.length === 0 || seen.has(n)) continue;
      seen.add(n);
      const arr = index.get(n) ?? [];
      arr.push({ ref: it.ref, raw: a });
      index.set(n, arr);
    }
  }

  const byRef = new Map(items.map((i) => [i.ref, i]));
  const pairs: DupePair[] = [];
  const donePairs = new Set<string>();
  let candidatePairs = 0;

  for (const [, group] of index) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const ra = group[i]!;
        const rb = group[j]!;
        if (ra.ref === rb.ref) continue;
        const key = ra.ref < rb.ref ? `${ra.ref}|${rb.ref}` : `${rb.ref}|${ra.ref}`;
        if (donePairs.has(key)) continue;
        donePairs.add(key);
        candidatePairs += 1;

        const A = byRef.get(ra.ref)!;
        const B = byRef.get(rb.ref)!;
        const sim = similarity(A.question, B.question);
        const shared = ra.raw;

        // ── 완전 동일: 판정이 아니라 동일성이다
        if (questionKey(A.question) === questionKey(B.question)) {
          pairs.push({
            a: A.ref, b: B.ref, level: 'exact', verdict: 'duplicate',
            sharedAnswer: shared, similarity: 1,
            reason: '문장부호를 지운 질문과 정답이 모두 같다. 동일 문제다',
          });
          continue;
        }

        if (A.midKey === B.midKey) {
          const dup = sim >= DUPE_THRESHOLDS.sameMidDuplicate;
          pairs.push({
            a: A.ref, b: B.ref, level: 'same-mid',
            verdict: dup ? 'duplicate' : 'suspect',
            sharedAnswer: shared, similarity: sim,
            reason: dup
              ? `같은 중분류(${A.midKey}) + 같은 정답 + 질문 유사도 ${sim.toFixed(2)}`
              : `같은 중분류(${A.midKey}) + 같은 정답. 질문은 다르다(유사도 ${sim.toFixed(2)}) — 사람이 판단`,
          });
          continue;
        }

        if (A.majorKey === B.majorKey) {
          const sus = sim >= DUPE_THRESHOLDS.sameMajorSuspect;
          pairs.push({
            a: A.ref, b: B.ref, level: 'same-major',
            verdict: sus ? 'suspect' : 'ok',
            sharedAnswer: shared, similarity: sim,
            reason: sus
              ? `대분류가 같고(${A.majorKey}) 질문도 닮았다(${sim.toFixed(2)}). 중분류 배정이 잘못됐을 수 있다`
              : `대분류만 같다. 정답이 겹치는 것은 자연스럽다(유사도 ${sim.toFixed(2)})`,
          });
          continue;
        }

        const sus = sim >= DUPE_THRESHOLDS.crossMajorSuspect;
        pairs.push({
          a: A.ref, b: B.ref, level: 'cross-major',
          verdict: sus ? 'suspect' : 'ok',
          sharedAnswer: shared, similarity: sim,
          reason: sus
            ? `대분류가 다른데 질문이 매우 닮았다(${sim.toFixed(2)}). 카테고리 배정을 확인해야 한다`
            : '대분류가 다르고 질문도 다르다. 건우 원칙대로 문제없다',
        });
      }
    }
  }

  const counts: Record<DupeVerdict, number> = { duplicate: 0, suspect: 0, ok: 0 };
  for (const p of pairs) counts[p.verdict] += 1;

  const n = items.length;
  return {
    pairs,
    counts,
    candidatePairs,
    totalPairsIfBruteForce: (n * (n - 1)) / 2,
  };
}
