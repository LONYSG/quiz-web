// =============================================================================
// 역검증 회귀 자료의 정합성 테스트 (R013 작업 A-2)
//
// ★★ 왜 이 테스트가 필요한가 (건우 지시: "자동 테스트로 고정하라")
//   회귀 측정 자체는 Gemini API 를 부른다. 그래서 자동 테스트로 만들 수 없다 —
//   ★ 테스트가 일 한도를 소모하면 verify 를 돌릴 때마다 429 를 맞는다.
//
//   ★ 그러나 **자료가 썩는 것**은 API 없이 막을 수 있고, 그것이 더 자주 생기는 사고다.
//     · shouldCatch 항목에 '무엇이 틀렸는가' 가 빠지면 측정 결과를 해석할 수 없다
//     · 정상 항목에 실제 결함이 섞이면 오탐률이 거짓으로 높아진다
//     · ref 가 겹치면 채점이 조용히 어긋난다
//   → ★ 자료의 정합성을 고정한다. 측정은 스크립트로 한다.
//
// ★ 실행: npm run verify (vitest 에 포함된다)
// =============================================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRules } from './rules.js';

const FILE = path.join(process.cwd(), 'data/pipeline/regression/backcheck-p3.json');
const spec = JSON.parse(readFileSync(FILE, 'utf8')) as {
  _meta: Record<string, unknown>;
  shouldCatch: {
    id: string;
    question: string;
    answers: string[];
    whatIsWrong: string;
    expect: string;
    source: string;
  }[];
  shouldNotCatch: { id: string; question: string; answers: string[]; source: string }[];
};

/** ★ 이 자료는 대표 정답을 따로 두지 않는다. answers[0] 이 대표다 */
const display = (x: { answers: string[] }): string => x.answers[0] ?? '';

const all = [...spec.shouldCatch, ...spec.shouldNotCatch];

describe('회귀 자료 — 구조', () => {
  it('★ 잡아야 할 것과 정상 항목이 모두 있어야 한다', () => {
    // ★ 재현율만 재면 "다 잡는다" 로 수렴한다. 오탐도 같이 재야 한다 (R010 교훈)
    expect(spec.shouldCatch.length).toBeGreaterThan(0);
    expect(spec.shouldNotCatch.length).toBeGreaterThan(0);
    // ★ 정상 항목이 더 많아야 오탐률이 뜻을 가진다
    expect(spec.shouldNotCatch.length).toBeGreaterThan(spec.shouldCatch.length);
  });

  it('★ id 가 겹치지 않는다 (겹치면 채점이 조용히 어긋난다)', () => {
    const ids = all.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('★ 모든 항목에 질문과 정답이 있다', () => {
    for (const x of all) {
      expect(x.question.trim().length, x.id).toBeGreaterThan(5);
      expect(x.answers.length, x.id).toBeGreaterThan(0);
      expect(display(x).trim().length, x.id).toBeGreaterThan(0);
      // ★ 어디서 온 항목인지 적혀 있어야 한다. 출처 없는 회귀 자료는 신뢰할 수 없다
      expect(x.source?.trim().length, x.id).toBeGreaterThan(0);
    }
  });
});

describe('회귀 자료 — 잡아야 할 것', () => {
  it('★★ 무엇이 어떻게 틀렸는지가 적혀 있어야 한다', () => {
    // ★ 이것이 없으면 "모델이 못 잡았다" 를 봐도 원인을 판단할 수 없다
    for (const x of spec.shouldCatch) {
      expect(x.whatIsWrong?.trim().length, x.id).toBeGreaterThan(10);
    }
  });

  it('★ 어느 필드로 잡혀야 하는지가 적혀 있어야 한다', () => {
    // ★ p3 는 세 필드를 나눠 받는다. 엉뚱한 필드로 잡은 것을 정답으로 세면 측정이 무의미해진다
    const valid = ['factualIssues', 'uniquenessIssue', 'spellingIssues'];
    for (const x of spec.shouldCatch) {
      expect(valid, x.id).toContain(x.expect);
    }
  });

  it('★ R012 에서 실제로 통과해 버린 4건이 들어 있어야 한다', () => {
    // ★ 근거 — 실측에서 나온 실패를 자료로 만들지 않으면 같은 실패가 또 통과한다
    const ids = spec.shouldCatch.map((x) => x.id);
    for (const need of ['R012-F1', 'R012-S1', 'R012-S2', 'R012-U1']) {
      expect(ids, `${need} 가 회귀 자료에서 사라졌다`).toContain(need);
    }
  });
});

describe('회귀 자료 — 정상 항목', () => {
  it('★★ 정상 항목은 규칙 검사를 통과해야 한다', () => {
    // ★ 정상 항목에 규칙 위반이 섞여 있으면 "오탐" 이 아니라 실제 결함이다.
    //   ★ 그것을 오탐으로 세면 프롬프트를 엉뚱하게 고치게 된다
    for (const x of spec.shouldNotCatch) {
      const r = checkRules({
        questionKo: x.question,
        displayAnswer: display(x),
        answers: x.answers,
        hintAnswer: display(x),
        category: '테스트',
        difficulty: 'medium',
        explanation: '',
        answerLang: 'ko',
      });
      expect(r.pass, `${x.id}: ${r.reasons.join(', ')}`).toBe(true);
    }
  });

  it('★ 일부러 까다롭게 만든 대조 항목이 들어 있어야 한다', () => {
    // ★ 근거 — 쉬운 정상 항목만 모으면 오탐률이 0으로 나오고, 그 0은 아무것도 말해주지 않는다
    const ids = spec.shouldNotCatch.map((x) => x.id);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    // OK-5 는 R012-U1(룩)의 대조군이다 — 한정어가 제대로 들어간 비숍 문제
    expect(ids).toContain('OK-5');
  });
});
