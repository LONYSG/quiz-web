// =============================================================================
// 저장된 배치를 다시 판정한다 (R010)
//
// ★★ 왜 필요한가
//   역검증 판정 규칙을 고쳤을 때, 그 효과를 확인하려면 다시 가공해야 하는가?
//   ★ 아니다. 원본과 모델 응답을 함께 보관하는 설계(R002 2-3)의 목적이 이것이다.
//   저장된 backcheck.answer / alternatives / confidence 와 answers 만 있으면
//   **API 호출 없이** 판정을 다시 계산할 수 있다.
//
//   ★ 토큰은 유한하고 회복이 느리다. 규칙을 고칠 때마다 다시 가공하면
//     규칙을 개선할수록 데이터를 잃는다.
//
// ★ 다시 계산하는 것은 **판정**뿐이다. 생성물(번역·복수 정답)은 손대지 않는다.
//   그것은 모델이 만든 것이므로 다시 만들려면 호출이 필요하다.
// =============================================================================

import { normalizeAnswer } from '@quiz/shared';
import { checkRules } from './rules.js';
import type { ProcessedItem } from './types.js';

export interface RejudgeStats {
  total: number;
  /** 판정이 바뀐 항목 수 */
  changed: number;
  /** reject → accept 로 바뀐 수 (오탈락 회복) */
  recovered: number;
  /** accept → reject 로 바뀐 수 */
  newlyRejected: number;
  /** 검수 대기로 표시된 수 */
  needsReview: number;
}

/**
 * 저장된 항목의 역검증·규칙 판정을 현재 규칙으로 다시 계산한다.
 *
 * ★ 규칙 필터 단계와 1차 가공 판정은 다시 계산하지 않는다.
 *   전자는 원본만 보므로 결과가 같고, 후자는 모델의 판정이라 재계산 대상이 아니다.
 */
export function rejudge(items: ProcessedItem[]): RejudgeStats {
  const stats: RejudgeStats = {
    total: items.length,
    changed: 0,
    recovered: 0,
    newlyRejected: 0,
    needsReview: 0,
  };

  for (const item of items) {
    // 역검증까지 가지 못한 항목은 대상이 아니다
    if (item.rejectedAt === 'filter' || item.rejectedAt === 'ai') continue;
    if (!item.generated || !item.backcheck) continue;

    const before = item.verdict;
    const answers = item.generated.answers;
    const normSet = new Set(answers.map((a) => normalizeAnswer(a)));
    const matched = normSet.has(normalizeAnswer(item.backcheck.answer));
    const outside = (item.backcheck.alternatives ?? []).filter((alt) => {
      const n = normalizeAnswer(alt);
      return n.length > 0 && !normSet.has(n);
    });

    let reject = false;
    let needsReview = false;
    let note: string | null = null;
    let result: ProcessedItem['backcheck'] extends null ? never : 'pass' | 'mismatch' | 'ambiguous';

    if (matched) {
      result = 'pass';
      if (outside.length > 0) {
        needsReview = true;
        note = `역검증이 정답을 맞혔으나 집합 밖 대안을 제시했다: ${outside.join(', ')}`;
      }
    } else if (item.backcheck.result === 'ambiguous' && outside.length >= 2) {
      result = 'ambiguous';
      reject = true;
      note = '역검증에서 서로 다른 정답이 여럿으로 판정되었다';
    } else {
      result = 'mismatch';
      const high = (item.backcheck.confidence ?? 0) >= 0.7;
      reject = high;
      needsReview = !high;
      note = high
        ? '역검증이 다른 답을 확신했다'
        : '역검증이 답을 맞히지 못했으나 확신이 낮다';
    }

    item.backcheck = {
      answer: item.backcheck.answer,
      result,
      confidence: item.backcheck.confidence,
      alternatives: outside,
      note,
    };

    if (reject) {
      item.verdict = 'reject';
      item.rejectedAt = 'backcheck';
      item.rejectReasons = [`backcheck_${result}`];
    } else {
      // 규칙 검사를 다시 돌린다 (무료)
      const rules = checkRules(item.generated);
      item.rules = rules;
      if (!rules.pass) {
        item.verdict = 'reject';
        item.rejectedAt = 'rules';
        item.rejectReasons = rules.reasons;
      } else {
        item.verdict = 'accept';
        item.rejectedAt = null;
        item.rejectReasons = [];
        if (needsReview) {
          item.review.note = note;
          stats.needsReview += 1;
        }
      }
    }

    if (item.verdict !== before) {
      stats.changed += 1;
      if (before === 'reject' && item.verdict === 'accept') stats.recovered += 1;
      if (before === 'accept' && item.verdict === 'reject') stats.newlyRejected += 1;
    }
  }

  return stats;
}
