// =============================================================================
// 중복 판정 (작업 C-1 판단의 구현 / D-4 / R011)
//
// ★★ 건우가 확정한 원칙
//   · 같은 카테고리 + 같은 정답  → 중복 의심
//   · 다른 카테고리 + 같은 정답  → 대체로 문제없음
//   · 문장을 하나하나 판단하는 것은 비효율 → 카테고리+정답으로 후보를 좁힌다
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★ R012: 질문 문장 유사도를 **판정 근거에서 제거했다** (Q-70 확정).
//
//   R011에서 "같은 정답 다른 문제" 를 구분하려고 문자 2-그램 자카드를 넣었다.
//   ★ 실측이 그것을 반박했다 —
//
//     실제로 중복인 쌍의 유사도   0.13 / 0.28 / 0.29 / 0.32 / 0.43 / 0.50
//     실제로 다른 문제인 쌍       0.00
//
//   ★ 모델이 같은 내용을 완전히 다른 문장으로 쓰기 때문에, 같은 문제여도
//     유사도가 0.13까지 내려간다. 임계값을 어디에 두든 갈리지 않는다.
//   ★ 건우도 12쌍을 직접 검수하고 "유사도 책정이 부정확한 것 같다" 고 확인했다.
//     (건우 판정: 포르투갈어 1쌍만 다른 문제, 나머지 11쌍은 중복)
//
//   → 유사도를 판정에서 뺐다. 참고 수치로만 계산해 남긴다.
//   ★ 완전 동일 판정(questionKey 비교)은 유지한다. 그것은 판정이 아니라 동일성이다.
//   ★ "같은 정답 다른 문제" 의 구분은 **LLM 에게 맡긴다** (dedupe-llm.ts).
// ─────────────────────────────────────────────────────────────────────────────
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
  /**
   * 질문 문장 유사도 0.0~1.0.
   * ★★ R012: **판정에 쓰지 않는다.** 참고값이다. 근거는 파일 머리말에 있다.
   */
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
 * ★★ R012: 유사도 임계값을 없앴다. 판정에 쓰지 않는다.
 *   근거는 파일 머리말에 있다 — 실측에서 중복 쌍과 정상 쌍의 유사도 범위가 겹쳤다.
 *
 * ★ 이 상수를 남겨 두지 않는다. 남겨 두면 누군가 다시 쓴다.
 *   유사도는 DupePair.similarity 에 **참고 수치로만** 담긴다.
 */
export const DUPE_SIMILARITY_IS_ADVISORY = true;

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

        // ★★ R012: 정답이 겹치면 카테고리와 무관하게 **전부 의심으로 올린다.**
        //
        //   근거 (R011 실측 12쌍 + 건우 검수):
        //     같은 중분류 + 같은 정답   9쌍 중 8쌍이 실제 중복
        //     다른 중분류 + 같은 정답   3쌍 중 3쌍이 실제 중복  ← ★ 예상과 달랐다
        //     합계 12쌍 중 11쌍(91.7%)이 실제 중복이었다
        //
        //   ★ 건우 원칙 "다른 카테고리 + 같은 정답 → 문제없음" 이 성립하지 않았다.
        //     유일한 무해 사례가 오히려 **같은 중분류 안**에 있었다.
        //   → 카테고리는 자동 판정에 쓰지 않는다. **의심 강도(정렬)** 로만 쓴다.
        //   → 실제 판정은 LLM 이 한다 (dedupe-llm.ts).
        const level: DupeLevel =
          A.midKey === B.midKey ? 'same-mid' : A.majorKey === B.majorKey ? 'same-major' : 'cross-major';
        const strength =
          level === 'same-mid' ? '강' : level === 'same-major' ? '중' : '약';
        pairs.push({
          a: A.ref,
          b: B.ref,
          level,
          // ★ 전부 suspect 다. duplicate 는 exact(완전 동일)에만 쓴다.
          verdict: 'suspect',
          sharedAnswer: shared,
          similarity: sim,
          reason:
            `정답 "${shared}" 이 겹친다 (의심 강도 ${strength} — ${level}). ` +
            `★ 유사도 ${sim.toFixed(2)} 는 참고값이며 판정에 쓰지 않는다 (R012). LLM 판정 대상`,
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
