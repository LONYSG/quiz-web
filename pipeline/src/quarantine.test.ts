// =============================================================================
// 격리와 과다 필터링 감지 테스트 (R013 작업 B)
//
// ★★ 이 파일의 목적은 두 가지다.
//   (1) ★ "버리지 않는다" 는 Q-75 확정 규칙이 코드로 지켜지는지 고정한다
//   (2) ★ R013 실측에서 실제로 발견한 결함이 다시 생기지 않게 막는다
//
// ★ R013 에서 발견한 결함 —
//   50건 배치가 429 로 역검증을 못 해 100% 격리되었는데,
//   ★ 그것이 '역검증 격리' 로 집계되어 경고가 "판정 로직이 잘못됐다" 를 가리켰다.
//   ★★ 틀린 진단이다. 원인은 한도이고 고칠 곳이 완전히 다르다.
//   → 검증 미실행(backcheck_not_run)을 필터링 비율에서 분리했고, 여기서 고정한다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { detectOverFiltering, formatAlerts, FILTER_ALERT } from './quarantine.js';
import type { ProcessedItem } from './types.js';

function item(over: Partial<ProcessedItem> = {}): ProcessedItem {
  return {
    sourceId: 'gemini-gen',
    sourceRef: Math.random().toString(16).slice(2),
    verdict: 'accept',
    rejectedAt: null,
    rejectReasons: [],
    source: { question: '', correct: '', incorrect: [], category: '', difficulty: '' },
    generated: {
      questionKo: '테스트 질문인가?',
      displayAnswer: '답',
      answers: ['답'],
      hintAnswer: '답',
      category: '과학',
      difficulty: 'medium',
      explanation: '해설',
      answerLang: 'ko',
    },
    gen: null,
    ai: null,
    backcheck: null,
    rules: null,
    review: { status: 'pending', note: null },
    meta: {
      processModel: 'test',
      backcheckModel: null,
      promptVersion: 'p3',
      processedAt: '2026-09-10T00:00:00.000Z',
      totalTokens: 0,
    },
    ...over,
  } as ProcessedItem;
}

function quarantined(stage: string, reasons: string[]): ProcessedItem {
  return item({
    verdict: 'quarantine',
    rejectedAt: stage as ProcessedItem['rejectedAt'],
    rejectReasons: reasons,
    quarantine: {
      stage: stage as 'ai' | 'backcheck' | 'rules' | 'dupe' | 'select',
      reasons,
      detail: '테스트 격리',
      judgedBy: 'test',
      judgedAt: '2026-09-10T00:00:00.000Z',
    },
  });
}

describe('detectOverFiltering — 표본 크기', () => {
  it('★ 표본이 기준보다 작으면 비율 판정을 하지 않는다', () => {
    const items = [
      ...Array.from({ length: 5 }, () => quarantined('backcheck', ['backcheck_mismatch'])),
      ...Array.from({ length: 5 }, () => item()),
    ];
    const r = detectOverFiltering(items);
    // 격리율 50% 지만 표본이 10건이므로 경고하지 않는다
    expect(r.sampleTooSmall).toBe(true);
    expect(r.alerts).toEqual([]);
  });

  it('표본이 충분하면 판정한다', () => {
    const items = Array.from({ length: FILTER_ALERT.minSample }, () => item());
    expect(detectOverFiltering(items).sampleTooSmall).toBe(false);
  });
});

describe('detectOverFiltering — 단계별 기준', () => {
  it('★ 역검증 격리율이 기준을 넘으면 경고한다', () => {
    const items = [
      ...Array.from({ length: 20 }, () => quarantined('backcheck', ['backcheck_mismatch'])),
      ...Array.from({ length: 80 }, () => item()),
    ];
    const r = detectOverFiltering(items);
    const a = r.alerts.find((x) => x.stage === 'backcheck');
    expect(a).toBeDefined();
    expect(a?.rate).toBeCloseTo(0.2, 5);
    // ★ 원인을 판단할 표본이 함께 나와야 한다. 숫자만으로는 원인을 모른다
    expect(a?.samples.length).toBeGreaterThan(0);
  });

  it('★ 규칙 검사는 기준이 더 낮다 (결정적인 검사이므로)', () => {
    expect(FILTER_ALERT.rules).toBeLessThan(FILTER_ALERT.backcheck);
    const items = [
      ...Array.from({ length: 12 }, () => quarantined('rules', ['answer_in_question'])),
      ...Array.from({ length: 88 }, () => item()),
    ];
    const r = detectOverFiltering(items);
    expect(r.alerts.some((x) => x.stage === 'rules')).toBe(true);
  });

  it('기준 안이면 경고하지 않는다', () => {
    const items = [
      ...Array.from({ length: 2 }, () => quarantined('backcheck', ['backcheck_mismatch'])),
      ...Array.from({ length: 98 }, () => item()),
    ];
    expect(detectOverFiltering(items).alerts).toEqual([]);
  });
});

describe('★★ 검증 미실행은 필터링과 분리한다 (R013 실측 결함)', () => {
  it('★ backcheck_not_run 은 역검증 격리율에 들어가지 않는다', () => {
    // ★ R013 실측 그대로 — 50건 전부가 429 로 역검증되지 않았다
    const items = Array.from({ length: 50 }, () =>
      quarantined('backcheck', ['backcheck_not_run']),
    );
    const r = detectOverFiltering(items);

    expect(r.notRun).toBe(50);
    // ★★ 핵심 — '역검증 판정이 잘못됐다' 는 경고가 나오면 안 된다. 틀린 진단이다
    expect(r.alerts.some((x) => x.stage === 'backcheck')).toBe(false);
    expect(r.byStage.backcheck ?? 0).toBe(0);
    // ★ 그러나 사유별 집계에는 남아야 한다. 정보를 잃지 않는다
    expect(r.byReason.backcheck_not_run).toBe(50);
  });

  it('★ 판정된 건수가 0이면 비율 판정을 하지 않는다', () => {
    const items = Array.from({ length: 50 }, () =>
      quarantined('backcheck', ['backcheck_not_run']),
    );
    const r = detectOverFiltering(items);
    expect(r.sampleTooSmall).toBe(true);
    const out = formatAlerts(r).join('\n');
    // ★ 사람이 읽었을 때 원인을 바로 알 수 있어야 한다
    expect(out).toContain('검증이 실행되지 않아');
    expect(out).toContain('필터링 문제가 아니다');
  });

  it('★ 검증 미실행과 실제 격리가 섞여 있으면 분모에서 미실행분을 뺀다', () => {
    const items = [
      ...Array.from({ length: 50 }, () => quarantined('backcheck', ['backcheck_not_run'])),
      ...Array.from({ length: 10 }, () => quarantined('backcheck', ['backcheck_mismatch'])),
      ...Array.from({ length: 40 }, () => item()),
    ];
    const r = detectOverFiltering(items);
    expect(r.notRun).toBe(50);
    const a = r.alerts.find((x) => x.stage === 'backcheck');
    // 분모가 100 이 아니라 50 이다 → 10/50 = 20% > 15%
    expect(a).toBeDefined();
    expect(a?.total).toBe(50);
    expect(a?.rate).toBeCloseTo(0.2, 5);
  });
});

describe('needsRuleDecision', () => {
  it('★ 규칙 결정이 필요한 건수를 따로 센다', () => {
    const items = [
      item({ needsRuleDecision: true }),
      quarantined('backcheck', ['backcheck_mismatch']),
      item(),
    ];
    expect(detectOverFiltering(items).needsRuleDecision).toBe(1);
  });
});

describe('★★ 격리는 폐기가 아니다 (Q-75)', () => {
  it('quarantine 은 accepted 에도 세지 않고 최종 폐기로도 세지 않는다', () => {
    const items = [
      quarantined('backcheck', ['backcheck_mismatch']),
      item(),
      item({ verdict: 'reject', rejectedAt: 'backcheck', rejectReasons: ['x'] }),
    ];
    const r = detectOverFiltering(items);
    expect(r.accepted).toBe(1);
    expect(r.quarantined).toBe(1);
    // ★ 전체는 3건이다. 격리를 통과로도 폐기로도 세지 않았다
    expect(r.total).toBe(3);
  });
});
