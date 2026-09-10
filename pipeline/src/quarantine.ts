// =============================================================================
// 격리 조회와 과다 필터링 감지 (R013 작업 B)
//
// ★★ 건우 지시
//   "역검증·중복 판정 시 문제를 바로 버리지 말고 ★ 별도로 격리하든지
//    로그를 디테일하게 남겨라.
//    ★ 필터링이 너무 많이 됐다고 판단되면 다시 Opus 에게 물어보고 최종 확정하는 것으로 하자."
//
// ★★ 그 판단을 사람이 매번 하면 놓친다. **스스로 감지하게 만든다.**
// =============================================================================

import type { ProcessedItem } from './types.js';

/**
 * ★★ 단계별 탈락률 기준.
 *
 * ★★ 기준값의 근거 — 실측만 쓴다
 *
 *   R012 정상 탈락률 (105건 × 2)
 *     역검증 탈락   1~2건 → 약 1~2%
 *     규칙 검사 탈락 0~2건 → 약 0~2%
 *     ★ 즉 정상 상태에서는 단계별 5% 미만이다.
 *
 *   ★ 반대 증거 — 규칙이 잘못됐을 때 어떤 수치가 나왔는가
 *     R010: 역검증이 정상 문제 6건을 **전부** 오탈락시켰다. 그때 생존율 11.8%.
 *           ★ 판정 로직을 고치자 29.4%가 되었다. **원인은 개별 문제가 아니라 로직이었다.**
 *     R011: answer_in_question 이 탈락 10건 중 5건이었다 (규칙 검사 탈락률 약 4%).
 *           ★ 원인은 프롬프트였고, 고치자 0건이 되었다.
 *
 *   → ★ 판단: **단계별 탈락률이 15%를 넘으면 개별 문제가 아니라 규칙·프롬프트가 잘못된 것**
 *     으로 본다. 근거 —
 *       · 정상은 1~5%다. 15%는 그것의 3~15배다
 *       · R010의 오탈락 사태에서 역검증 탈락률이 6/17 = 35%였다. 15%는 그보다 낮은 문턱이다
 *       · ★ 너무 낮게 잡으면(예: 5%) 정상 변동에도 멈춘다. 그러면 경고가 무의미해진다
 *
 * ★ 단계마다 기준을 달리한 근거 (지시 항목)
 *   · 역검증 15% — 위 근거대로
 *   · 규칙 검사 10% — ★ 더 낮게 잡았다. 규칙 검사는 **결정적**이다(코드다).
 *     모델의 변동이 없으므로 높은 탈락률은 곧 규칙이나 프롬프트의 결함이다.
 *     R011 실측에서 프롬프트를 고쳐 4% → 0%가 되었다
 *   · 카테고리 불일치 5% — ★ 가장 낮게 잡았다. R011·R012 실측에서 **0건**이었다.
 *     0건이 정상이므로 5%만 나와도 카테고리 입력 방식이 깨진 것이다
 *   · 질문 문장 문제 20% — ★ 가장 높게 잡았다. p3 는 이번에 새로 넣은 검사다.
 *     ★ 정상 수준을 모른다. 낮게 잡으면 첫 실행부터 멈춘다.
 *     ★★ 이 값은 실측 후 조정해야 하는 값이다. 그 사실을 명시한다
 */
export const FILTER_ALERT = {
  /** 역검증 격리율 */
  backcheck: Number(process.env.PIPELINE_ALERT_BACKCHECK ?? 0.15),
  /** 규칙 검사 격리율 */
  rules: Number(process.env.PIPELINE_ALERT_RULES ?? 0.1),
  /** 카테고리 불일치율 */
  offCategory: Number(process.env.PIPELINE_ALERT_OFFCATEGORY ?? 0.05),
  /** ★ 질문 문장 문제율 (p3 신규. 정상 수준 확인 필요) */
  questionIssue: Number(process.env.PIPELINE_ALERT_QUESTION ?? 0.2),
  /** 전체 격리율 (단계 합산) */
  total: Number(process.env.PIPELINE_ALERT_TOTAL ?? 0.3),
  /**
   * ★ 표본이 이보다 작으면 판정하지 않는다.
   *   ★ 근거: 10건 중 2건이면 20%지만 그것으로 규칙이 잘못됐다고 말할 수 없다.
   *   비율은 표본이 있어야 의미가 있다.
   */
  minSample: Number(process.env.PIPELINE_ALERT_MIN_SAMPLE ?? 20),
} as const;

export interface FilterAlert {
  stage: string;
  count: number;
  total: number;
  rate: number;
  threshold: number;
  /** ★ 왜 이것이 문제인가 */
  why: string;
  /** ★ 원인을 판단할 표본 */
  samples: { ref: string; question: string; reasons: string[]; detail: string }[];
}

export interface FilterReport {
  total: number;
  accepted: number;
  quarantined: number;
  byStage: Record<string, number>;
  byReason: Record<string, number>;
  /** ★ 기준을 넘은 단계들. 비어 있지 않으면 **작업을 멈추고 보고해야 한다** */
  alerts: FilterAlert[];
  /** ★ 표본이 작아 판정하지 않았는가 */
  sampleTooSmall: boolean;
  needsRuleDecision: number;
  /**
   * ★★ 검증이 **실행되지 않아** 격리된 건수 (backcheck_not_run).
   *
   * ★ 왜 따로 세는가 (R013 실측으로 알았다)
   *   429 로 역검증을 못 한 50건이 역검증 격리로 집계되어 격리율 100%가 되었다.
   *   ★ 그러면 경고가 "역검증 판정 로직이 잘못됐다" 를 가리킨다. **틀린 진단이다.**
   *   ★ 원인은 판정이 아니라 한도다. 고칠 곳이 완전히 다르다.
   * → 필터링 비율 계산에서 빼고 따로 보고한다.
   */
  notRun: number;
}

/**
 * ★★ 과다 필터링을 감지한다.
 *
 * ★ 멈췄을 때 무엇을 보고할지 (지시 항목)
 *   · 어느 단계가 기준을 넘었는가 / 비율과 기준
 *   · ★ 탈락 사유 분포 — 한 사유에 몰려 있으면 그것이 원인이다
 *   · ★ 표본 (최대 5건) — 원인을 판단하려면 실제 문제를 봐야 한다
 *   ★ 숫자만 보고하면 원인을 알 수 없다. R011에서 "탈락 10건 중 5건이 한 원인" 을
 *     안 것은 실제 문제를 봤기 때문이다.
 */
export function detectOverFiltering(items: readonly ProcessedItem[]): FilterReport {
  const total = items.length;
  const accepted = items.filter((i) => i.verdict === 'accept').length;
  const quarantined = items.filter((i) => i.verdict === 'quarantine').length;

  const byStage: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const samplesByStage = new Map<string, FilterAlert['samples']>();

  let questionIssueCount = 0;
  let needsRuleDecision = 0;
  let notRun = 0;

  for (const i of items) {
    if (i.needsRuleDecision) needsRuleDecision += 1;
    if (i.verdict !== 'quarantine') continue;

    // ★★ 검증 미실행은 필터링이 아니다. 사유별 집계에는 남기고 단계별에서는 뺀다
    if (i.rejectReasons.includes('backcheck_not_run')) {
      notRun += 1;
      for (const r of i.rejectReasons) byReason[r] = (byReason[r] ?? 0) + 1;
      continue;
    }

    const stage = i.quarantine?.stage ?? i.rejectedAt ?? 'unknown';
    byStage[stage] = (byStage[stage] ?? 0) + 1;
    for (const r of i.rejectReasons) byReason[r] = (byReason[r] ?? 0) + 1;
    if (i.rejectReasons.includes('question_issue')) questionIssueCount += 1;

    const arr = samplesByStage.get(stage) ?? [];
    if (arr.length < 5) {
      arr.push({
        ref: i.sourceRef,
        question: i.generated?.questionKo ?? '(생성되지 않았다)',
        reasons: i.rejectReasons,
        detail: i.quarantine?.detail ?? '',
      });
      samplesByStage.set(stage, arr);
    }
  }

  const alerts: FilterAlert[] = [];
  // ★★ 분모는 '판정이 실제로 이루어진 건수' 다. 검증 미실행분을 빼야 비율이 뜻을 가진다
  const judged = total - notRun;
  const sampleTooSmall = judged < FILTER_ALERT.minSample;

  if (!sampleTooSmall) {
    const check = (stage: string, count: number, threshold: number, why: string): void => {
      if (count === 0) return;
      const rate = count / judged;
      if (rate <= threshold) return;
      alerts.push({
        stage,
        count,
        total: judged,
        rate,
        threshold,
        why,
        samples: samplesByStage.get(stage) ?? [],
      });
    };

    check(
      'backcheck',
      byStage.backcheck ?? 0,
      FILTER_ALERT.backcheck,
      '★ 역검증 격리율이 기준을 넘었다. R010에서 이 수치가 높았을 때 원인은 개별 문제가 아니라 판정 로직 버그였다',
    );
    check(
      'rules',
      byStage.rules ?? 0,
      FILTER_ALERT.rules,
      '★ 규칙 검사는 결정적이다(코드다). 격리율이 높으면 규칙이나 생성 프롬프트의 결함이다. R011에서 프롬프트를 고쳐 4%→0%가 되었다',
    );
    check(
      'ai',
      byStage.ai ?? 0,
      FILTER_ALERT.offCategory,
      '★ 생성 단계 격리(카테고리 불일치·빈 생성)는 R011·R012 실측에서 0건이었다. 0이 정상이므로 이 수치는 카테고리 입력 방식이 깨졌다는 뜻이다',
    );

    if (questionIssueCount > 0) {
      const rate = questionIssueCount / judged;
      if (rate > FILTER_ALERT.questionIssue) {
        alerts.push({
          stage: 'question_issue',
          count: questionIssueCount,
          total: judged,
          rate,
          threshold: FILTER_ALERT.questionIssue,
          why:
            '★ 질문 문장 문제(p3 신규 검사)가 기준을 넘었다. ' +
            '★ 둘 중 하나다 — (a) 생성이 실제로 부정확하다 (b) 검증이 없는 문제를 만들어 낸다. ' +
            '★ 표본을 읽어 어느 쪽인지 판단해야 한다. 정상 수준을 아직 모르는 검사다',
          samples: samplesByStage.get('backcheck') ?? [],
        });
      }
    }

    if (quarantined - notRun > 0) {
      const rate = (quarantined - notRun) / judged;
      if (rate > FILTER_ALERT.total) {
        alerts.push({
          stage: 'total',
          count: quarantined - notRun,
          total: judged,
          rate,
          threshold: FILTER_ALERT.total,
          why: '★ 전체 격리율이 기준을 넘었다. 단계별로는 기준 안이어도 합쳐서 많으면 생성 품질 자체를 의심해야 한다',
          samples: [],
        });
      }
    }
  }

  return {
    total,
    accepted,
    quarantined,
    byStage,
    byReason,
    alerts,
    sampleTooSmall,
    needsRuleDecision,
    notRun,
  };
}

/** 사람이 읽을 경고 문구 */
export function formatAlerts(report: FilterReport): string[] {
  const out: string[] = [];
  // ★★ 검증 미실행은 별개의 경고다. 필터링 문제가 아니라 한도 문제이므로 먼저 말한다
  if (report.notRun > 0) {
    out.push(
      `★★ 검증이 실행되지 않아 격리된 것 ${report.notRun}/${report.total}건 ` +
        `(${((report.notRun / report.total) * 100).toFixed(1)}%)`,
    );
    out.push(
      '   ★ 이것은 필터링 문제가 아니다. 429 등으로 역검증을 못 한 것이다. 고칠 곳이 다르다.',
    );
    out.push('   ★ 이 건수는 아래 필터링 비율의 분모에서 빼고 계산했다.');
  }
  if (report.sampleTooSmall) {
    out.push(
      `★ 판정이 이루어진 표본이 ${report.total - report.notRun}건이다 (기준 ${FILTER_ALERT.minSample}건). ` +
        '비율 판정을 하지 않았다 — 표본이 작으면 비율이 의미가 없다.',
    );
    return out;
  }
  if (report.alerts.length === 0) {
    out.push(
      `★ 과다 필터링 경고 없음 (격리 ${report.quarantined - report.notRun}/${report.total - report.notRun})`,
    );
    return out;
  }
  out.push('★★ 과다 필터링 경고 — 작업을 멈추고 원인을 판단해야 한다');
  for (const a of report.alerts) {
    out.push(
      `  [${a.stage}] ${a.count}/${a.total} = ${(a.rate * 100).toFixed(1)}% ` +
        `(기준 ${(a.threshold * 100).toFixed(0)}%)`,
    );
    out.push(`     ${a.why}`);
    for (const s of a.samples) {
      out.push(`     · ${s.question}`);
      out.push(`       사유: ${s.reasons.join(', ')} — ${s.detail}`);
    }
  }
  out.push('');
  out.push(`  탈락 사유 분포: ${JSON.stringify(report.byReason)}`);
  out.push('  ★ 한 사유에 몰려 있으면 그것이 원인이다 (R011에서 5/10 이 한 원인이었다)');
  return out;
}
