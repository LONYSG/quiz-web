// =============================================================================
// 출제 선별 기준 (Q-69 확정 / R012 작업 B-3)
//
// ★★ 건우가 R011 샘플 257건을 직접 검수하고 확정한 기준이다.
//
//   원문 취지
//     "접근성 3~5 정도면 아주 좋다. 1은 없는 게 낫고 2는 애매하다.
//      가끔 나와줘도 될 것 같기도 하다. 너무 쉽기만 해도 재미없다."
//     "난이도는 다 괜찮다. 접근성 수치가 중요한 것 같다.
//      ★ 난이도가 높아서 아무도 몰랐더라도 알아가면 좋은 상식이라면 불만 없다."
//     "카테고리가 문제가 아니라 ★ 진짜 엉뚱한 퀴즈만 거르면 된다."
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★ 세 축 중 무엇으로 거르는가
//
//   접근성  하한을 건다. 3 이상 통과 / 2 는 총량 제한 / 1 은 제외
//   난이도  ★ **거르지 않는다.**
//     ★ 근거: 정답 공개 5초에 해설이 나온다(guide 21절).
//       어려워서 아무도 못 맞혀도 그 30초는 낭비가 아니라 배우는 시간이다.
//       ★ R011에서 내가 "아무도 못 맞히면 30초가 낭비된다" 며 접근성 하한 4를
//         권했는데, 게임에 이미 있는 해설 장치를 계산에 넣지 않은 판단이었다.
//   알 가치 하한을 건다. ★ 이것이 "진짜 엉뚱한 퀴즈" 를 거르는 축이다
//
// ★ 임계값을 코드에 박지 않는다. 건우가 정하는 값이므로 설정으로 둔다 (지시).
// ─────────────────────────────────────────────────────────────────────────────
// =============================================================================

/**
 * ★ 선별 기준. 건우가 정하는 값이다.
 *
 * ★ 환경변수로 덮어쓸 수 있게 한 이유: 기준을 바꿔 결과가 어떻게 달라지는지
 *   재적재 없이 확인할 수 있어야 한다.
 */
export const SELECT = {
  /** 접근성 하한. 이 값 미만은 제외한다 */
  minAccessibility: Number(process.env.PIPELINE_MIN_ACCESS ?? 3),

  /**
   * ★ "애매한" 접근성 값. 통과시키지만 총량을 제한한다.
   *   건우: "2는 애매하다. 가끔 나와줘도 될 것 같기도 하다."
   */
  tolerateAccessibility: Number(process.env.PIPELINE_TOLERATE_ACCESS ?? 2),

  /**
   * ★ tolerateAccessibility 가 전체에서 차지할 수 있는 비율 상한.
   *
   * ★ 5% 근거 (건우 제시): 50문제 게임에 2~3개면
   *   "어려운 문제가 몇 개 섞인" 느낌이 된다. 그 이상이면 재미가 아니라 짜증이다.
   */
  tolerateRatio: Number(process.env.PIPELINE_TOLERATE_RATIO ?? 0.05),

  /**
   * ★ 알 가치 하한. **건우가 정할 값이다.**
   *   기본 3 으로 두었으나 확정값이 아니다 — R012 보고서 9장에서 묻는다.
   *   ★ 3 으로 둔 근거: g3 프롬프트가 "알 가치 3 미만이면 만들지 마라" 고 지시하므로
   *     같은 값을 하한으로 두어야 프롬프트와 선별이 어긋나지 않는다.
   */
  minWorthKnowing: Number(process.env.PIPELINE_MIN_WORTH ?? 3),

  /**
   * ★ 난이도로는 거르지 않는다. 이 값은 **기록용**이다.
   *   0 이면 검사하지 않는다는 뜻이다. 바꾸지 않기를 권한다 (Q-69 확정).
   */
  minDifficulty: Number(process.env.PIPELINE_MIN_DIFFICULTY ?? 0),
} as const;

export type SelectReason =
  | 'accessibility_too_low'
  | 'accessibility_tolerate_over_quota'
  | 'worth_too_low'
  | 'difficulty_too_low'
  | 'not_scored';

export interface SelectInput {
  ref: string;
  accessibility: number;
  difficultyScore: number;
  worthKnowing: number;
}

export interface SelectResult {
  ref: string;
  pass: boolean;
  reasons: SelectReason[];
}

export interface SelectReport {
  results: SelectResult[];
  passed: number;
  rejected: number;
  reasonCounts: Record<string, number>;
  /** tolerate 등급이 몇 건 통과했는가 / 상한은 몇 건이었는가 */
  tolerate: { allowed: number; passed: number; dropped: number };
}

/**
 * 선별을 실행한다.
 *
 * ★ 총량 제한(tolerateRatio)이 있어서 한 건씩 판정할 수 없다.
 *   전체를 받아 한 번에 판정한다.
 *
 * ★ 정렬 규칙: tolerate 등급 중 무엇을 남길지는 **알 가치가 높은 순**이다.
 *   근거: 접근성이 낮은 문제를 굳이 섞는 이유가 "알아가면 좋다" 이기 때문이다.
 *   같은 알 가치면 난이도가 높은 것을 남긴다 — 건우가 난이도를 문제 삼지 않았고
 *   "너무 쉽기만 해도 재미없다" 고 했다.
 */
export function selectQuestions(items: readonly SelectInput[]): SelectReport {
  const results: SelectResult[] = [];
  const reasonCounts: Record<string, number> = {};
  const bump = (k: string): void => {
    reasonCounts[k] = (reasonCounts[k] ?? 0) + 1;
  };

  // ── 1. 총량 제한과 무관한 판정을 먼저 한다
  const tolerateCandidates: SelectInput[] = [];
  const decided = new Map<string, SelectResult>();

  for (const it of items) {
    const reasons: SelectReason[] = [];

    // ★ 점수가 없는 것 (g2 이전에 만든 문제)
    if (it.accessibility <= 0 || it.worthKnowing <= 0) {
      reasons.push('not_scored');
    } else {
      if (it.accessibility < SELECT.tolerateAccessibility) {
        reasons.push('accessibility_too_low');
      }
      if (it.worthKnowing < SELECT.minWorthKnowing) {
        reasons.push('worth_too_low');
      }
      // ★ 난이도는 기본값 0 이므로 검사되지 않는다. 값을 올리면 검사된다.
      if (SELECT.minDifficulty > 0 && it.difficultyScore < SELECT.minDifficulty) {
        reasons.push('difficulty_too_low');
      }
    }

    if (reasons.length > 0) {
      decided.set(it.ref, { ref: it.ref, pass: false, reasons });
      continue;
    }

    // 여기까지 왔으면 알 가치는 통과했다. 접근성만 남았다.
    if (it.accessibility < SELECT.minAccessibility) {
      // ★ tolerate 등급이다. 총량 제한을 걸어야 하므로 뒤로 미룬다
      tolerateCandidates.push(it);
      continue;
    }
    decided.set(it.ref, { ref: it.ref, pass: true, reasons: [] });
  }

  // ── 2. tolerate 등급의 총량 제한
  //   ★ 분모는 "이 배치 전체" 다. 통과분만으로 계산하면 순환이 된다.
  const allowed = Math.floor(items.length * SELECT.tolerateRatio);
  const sorted = [...tolerateCandidates].sort(
    (a, b) => b.worthKnowing - a.worthKnowing || b.difficultyScore - a.difficultyScore,
  );
  let tolerated = 0;
  for (const it of sorted) {
    if (tolerated < allowed) {
      decided.set(it.ref, { ref: it.ref, pass: true, reasons: [] });
      tolerated += 1;
    } else {
      decided.set(it.ref, {
        ref: it.ref,
        pass: false,
        reasons: ['accessibility_tolerate_over_quota'],
      });
    }
  }

  // ── 3. 원래 순서대로 모은다
  let passed = 0;
  for (const it of items) {
    const r = decided.get(it.ref)!;
    results.push(r);
    if (r.pass) passed += 1;
    else for (const reason of r.reasons) bump(reason);
  }

  return {
    results,
    passed,
    rejected: results.length - passed,
    reasonCounts,
    tolerate: {
      allowed,
      passed: tolerated,
      dropped: tolerateCandidates.length - tolerated,
    },
  };
}

/** 사람이 읽을 사유 설명 */
export function explainReason(r: SelectReason): string {
  switch (r) {
    case 'accessibility_too_low':
      return `접근성이 ${SELECT.tolerateAccessibility} 미만이다 (제외 대상)`;
    case 'accessibility_tolerate_over_quota':
      return `접근성 ${SELECT.tolerateAccessibility} 등급의 총량 상한(${(SELECT.tolerateRatio * 100).toFixed(0)}%)을 넘었다`;
    case 'worth_too_low':
      return `알 가치가 ${SELECT.minWorthKnowing} 미만이다 — "알 필요 없는 문제"`;
    case 'difficulty_too_low':
      return `난이도가 ${SELECT.minDifficulty} 미만이다 (★ 기본값에서는 검사하지 않는다)`;
    case 'not_scored':
      return '점수가 매겨지지 않았다 (g2 이전 생성분)';
  }
}
