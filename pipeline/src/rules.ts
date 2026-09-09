// =============================================================================
// 규칙 검사 3종 (작업 E-2)
//
// ★★ shared 의 순수 함수를 재사용한다. 파이프라인용으로 다시 만들지 않는다.
//   두 곳에 있으면 반드시 어긋난다 (D-026 과 같은 이유).
//   ★ 특히 normalizeAnswer 가 어긋나면 치명적이다.
//     파이프라인이 저장한 answer_norm 과 런타임 판정이 달라져,
//     정답을 정확히 입력한 사람이 조용히 오답 처리된다.
//     ★ 에러도 로그도 남지 않는다. 그래서 반드시 같은 함수여야 한다.
//
// ★ 무료 검사다. LLM 을 부르지 않는다. 역검증이 통과시킨 것도 여기서 걸린다.
//   특히 "질문에 정답이 포함되었는가" 는 역검증이 반드시 통과시킨다
//   (질문에 답이 있으니 모델이 맞히는 것이 당연하다). 별도 검사가 필수다.
// =============================================================================

import { generateHint, normalizeAnswer } from '@quiz/shared';
import type { AiGenerated, RuleCheckResult } from './types.js';

/** 정답 문자열로 게임에 쓸 수 있는 형태인가 */
function answerShapeOk(answer: string): boolean {
  const t = answer.trim();
  if (t.length === 0) return false;
  // ★ 너무 길면 아무도 정확히 입력하지 못한다
  if (t.length > 30) return false;
  // 문장 부호로 끝나면 서술형이다
  if (/[.!?]$/.test(t)) return false;
  // 단어 5개 이상은 서술형으로 본다
  if (t.split(/\s+/).length >= 5) return false;
  return true;
}

/**
 * 규칙 검사.
 *
 * @param questionKo 가공된 한국어 질문
 * @param generated  가공 결과
 */
/**
 * ★★ 형식이 틀린 표기 변형만 걸러낸다 (R011 실측으로 추가).
 *
 * ★ 왜 필요한가 — R011 첫 실측에서 정상 문제 2건이 이것 때문에 탈락했다.
 *     "애플"           변형에 "Apple Inc." → 마침표로 끝나 서술형으로 판정
 *     "오페라의 유령"   변형에 "The Phantom of the Opera" → 단어 5개로 서술형 판정
 *   ★ 질문도 정답도 멀쩡하다. **변형 하나가 형식에 안 맞을 뿐이다.**
 *     그 하나 때문에 문제 전체를 버리는 것은 과잉이다.
 *   → 그 변형만 떼어내고 문제는 살린다.
 *
 * ★ 단 displayAnswer 가 형식에 안 맞으면 걸러내지 않는다.
 *   그것은 대표 표기 자체의 문제이므로 checkRules 가 탈락시켜야 한다.
 *   ★ 여기서 조용히 고쳐 통과시키면 규칙 검사를 우회하는 셈이 된다.
 */
export function sanitizeVariants(display: string, answers: readonly string[]): {
  kept: string[];
  dropped: string[];
} {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const a of answers) {
    if (a === display || answerShapeOk(a)) kept.push(a);
    else dropped.push(a);
  }
  return { kept, dropped };
}

export function checkRules(generated: AiGenerated): RuleCheckResult {
  const reasons: string[] = [];
  const question = generated.questionKo ?? '';
  const answers = generated.answers ?? [];
  const display = (generated.displayAnswer ?? '').trim();

  // ── 1. 질문에 정답이 포함되었는가
  //   ★ 정규화한 뒤에 비교한다. 띄어쓰기만 다른 경우를 놓치지 않기 위함이다.
  //   ★ 짧은 정답(정규화 후 2자 이하)은 검사하지 않는다.
  //     "물" 같은 정답은 어느 문장에나 우연히 들어 있을 수 있다.
  const normQuestion = normalizeAnswer(question);
  let answerInQuestion = false;
  for (const a of [display, ...answers]) {
    const na = normalizeAnswer(a);
    if (na.length >= 3 && normQuestion.includes(na)) {
      answerInQuestion = true;
      break;
    }
  }
  if (answerInQuestion) reasons.push('answer_in_question');

  // ── 2. 정규화하면 서로 같아지는 정답이 있는가
  //   ★ DB의 question_answers.answer_norm 에 UNIQUE 제약이 있다.
  //     충돌하는 배열을 그대로 적재하면 적재가 실패한다. 여기서 미리 잡는다.
  //   ★ 이것은 "탈락 사유" 가 아니라 "정리 대상" 이지만,
  //     LLM 이 같은 표기를 여러 번 넣는 것은 지시를 지키지 않은 신호이므로 기록한다.
  const seen = new Set<string>();
  let collision = false;
  for (const a of answers) {
    const na = normalizeAnswer(a);
    if (na.length === 0) continue;
    if (seen.has(na)) {
      collision = true;
      break;
    }
    seen.add(na);
  }
  if (collision) reasons.push('normalized_collision');

  // ── 3. displayAnswer 가 answers 에 있는가 (데이터 정합성)
  const normDisplay = normalizeAnswer(display);
  const displayAnswerListed = normDisplay.length > 0 && seen.has(normDisplay);
  if (!displayAnswerListed) reasons.push('display_answer_not_listed');

  // ── 4. 힌트를 만들 수 있는가 (D-004 / Q-37)
  //   ★ 전처리 후 길이가 1이면 힌트를 만들지 않는 것이 규칙이다.
  //     힌트가 없는 문제 자체는 허용된다(게임이 힌트 없이 진행한다).
  //     ★ 그러나 힌트가 정답과 같아지면 정답 노출이므로 반드시 탈락시킨다.
  const hintBase = (generated.hintAnswer ?? display).trim();
  const hint = generateHint(hintBase);
  const hintAvailable = hint !== null;
  const hintEqualsAnswer =
    hint !== null && normalizeAnswer(hint) === normalizeAnswer(hintBase) && hint.length > 0;
  if (hintEqualsAnswer) reasons.push('hint_equals_answer');

  // ── 5. 정답 형식
  const shapeOk = answerShapeOk(display) && answers.every((a) => answerShapeOk(a));
  if (!shapeOk) reasons.push('answer_shape');

  // ── 6. 복수 정답이 하나뿐인가
  //   ★ 탈락시키지 않는다. 정답이 하나뿐인 것이 자연스러운 문제도 있다
  //     (예: 숫자 답). 다만 표기 변형 확보가 이 파이프라인의 핵심 산출물이므로
  //     기록해서 나중에 프롬프트 품질을 평가할 수 있게 한다.
  if (answers.length <= 1) reasons.push('few_variants');

  // ★ 탈락 판정에서 few_variants 와 normalized_collision 은 제외한다.
  //   전자는 정상일 수 있고, 후자는 적재 시 중복을 제거하면 된다.
  const fatal = reasons.filter(
    (r) => r !== 'few_variants' && r !== 'normalized_collision',
  );

  return {
    answerInQuestion,
    normalizedCollision: collision,
    displayAnswerListed,
    hintAvailable,
    hintEqualsAnswer,
    answerShapeOk: shapeOk,
    reasons,
    pass: fatal.length === 0,
  };
}

/**
 * 적재용 정답 배열 정리.
 *
 * ★ 정규화해서 같아지는 것을 하나로 합친다. DB의 UNIQUE 제약을 만족시키기 위함이다.
 *   ★ 사람이 읽는 표기는 첫 번째 것을 남긴다. 정규화 값만 키로 쓴다.
 */
export function dedupeAnswers(answers: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of answers) {
    const t = a.trim();
    if (!t) continue;
    const na = normalizeAnswer(t);
    if (!na || seen.has(na)) continue;
    seen.add(na);
    out.push(t);
  }
  return out;
}
