// =============================================================================
// 규칙 필터 (작업 C) — Gemini 호출 **전**에 거른다
//
// ★ 목적은 무료 한도를 아끼는 것이다. 규칙으로 확실히 거를 수 있는 것을
//   LLM 에 보내지 않는다. 1건당 호출 2회(가공+역검증)를 절약한다.
//
// ★★ 과하게 거르지 않는 것이 더 중요하다.
//   R001의 초기 필터는 "which" 를 통째로 잡아 26.9%를 탈락시켰는데,
//   조건을 엄격히 하자 18.0%로 내려갔다. **즉 느슨한 필터가 멀쩡한 문제 9%를 버렸다.**
//   R002가 남긴 반례:
//     "Which type of cutlery is most suited for eating soup?" → Spoon      (전환 가능)
//     "Which European city is known as the 'City of Light'?"  → Paris      (전환 가능)
//     "Which small country is located between France and Spain?" → Andorra (전환 가능)
//   ★ 그래서 "which" 단독으로는 거르지 않는다. 보기 집합을 **반드시** 참조하는
//     표현만 거른다.
//
// ★ 자동 탐지의 한계 (R002 2-2)
//   보기 참조형은 18.1% 가 자동으로 잡혔다.
//   ★ 그러나 "보기를 빼면 정답이 유일하지 않은" 유형은 자동으로 3.0% 만 잡혔고
//     수동 라벨링에서는 훨씬 많았다. **문장만 보면 멀쩡하기 때문이다.**
//     그 판정은 LLM 의 의미 판단이 반드시 필요하다 (작업 D).
//   → 이 필터는 "확실한 것만" 거른다. 애매한 것은 통과시켜 LLM 이 보게 한다.
// =============================================================================

import type { FilterResult, RawQuestion } from './types.js';

/**
 * ★ 보기가 **없으면 문장이 무의미해지는** 표현.
 *
 * ★★ R010 실측으로 좁혔다. 처음에는 "of the following / of these" 를 무조건 걸렀는데,
 *   차단된 27건을 전수 검토하니 **3건이 오차단**이었다.
 *     · "Which of these characters is the mascot of SEGA?" → 세가의 마스코트는? (유일)
 *     · "conservation of energy … are consequences of which of the following?" → 뇌터 정리 (유일)
 *     · "The medical term for the belly button is which of the following?" → 배꼽의 의학 용어는? (유일)
 *   ★ 이 세 문장의 "of the following/these" 는 **떼어낼 수 있는 껍데기**다.
 *     떼어내도 정답이 유일하게 남는다.
 *
 * ★ 그래서 부정어와 함께 있을 때만 거른다.
 *   "NOT a piece from West Side Story" 처럼 부정이 들어가면 보기 집합이 있어야만
 *   답이 정해진다. 보기를 지우면 "웨스트사이드 스토리의 곡이 아닌 것" 이 되어
 *   세상의 거의 모든 것이 정답이 된다. 이것은 회복 불가능하다.
 *
 * ★ 부정어 없는 껍데기는 통과시켜 LLM 이 보게 한다.
 *   R002의 프롬프트가 "보기 참조 표현을 주관식 어투로 자연스럽게 고친다" 를 이미 지시한다.
 *   ★ 손실 비대칭: 좋은 문제를 버리는 것은 영구 손실이고, 토큰은 매일 회복된다.
 *     그래서 애매하면 통과시킨다.
 */
const OPTION_WRAPPER = [
  /\bof the following\b/i,
  /\bof these\b/i,
  /\bof the below\b/i,
  /\bthe following\b/i,
];

/**
 * ★ 인용구를 지운 문장.
 *
 * ★ R010 실측으로 추가했다. 이 문제가 오차단되었다.
 *   "Which of these games includes the phrase \"Do not pass Go, do not collect $200\"?"
 *   → 정답 Monopoly. 주관식으로 완전히 성립한다.
 *   ★ 걸린 이유는 인용된 **게임 문구 안**의 "Do not" 이었다.
 *     질문의 논리에 있는 부정이 아니라 인용문의 일부다.
 *   → 부정어를 찾기 전에 인용구를 지운다.
 */
function stripQuoted(text: string): string {
  return text
    .replace(/"[^"]*"/g, ' ')
    .replace(/'[^']*'/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/‘[^’]*’/g, ' ');
}

/** 부정어. ★ 이것이 보기 참조와 함께 있으면 보기 없이는 답이 정해지지 않는다 */
const NEGATION = [
  /\bnot\b/i,
  /\bn't\b/i,
  /\bexcept\b/i,
  /\bcannot\b/i,
  /\bnever\b/i,
  /\bleast\b/i,
];

/** 보기 집합 자체를 가리키는 표현. 이것은 부정어와 무관하게 회복 불가능하다 */
const OPTION_ONLY = [
  /\ball of the above\b/i,
  /\bnone of the above\b/i,
  /\bboth of the\b/i,
  /\bthese (?:two|three|four|five)\b/i,
  /\beither of the\b/i,
];

/**
 * 정답이 여럿임을 문장이 스스로 드러내는 표현.
 *
 * ★ R010에서 /\bwhich of\b/ 를 제거했다.
 *   그것은 "which of these/following" 전체에 걸려 위 껍데기 판정과 중복되고,
 *   R002가 경고한 "느슨한 필터가 멀쩡한 문제를 버린다" 를 그대로 재현했다.
 *   ★ "one of" 만 남긴다. 그것은 정의상 정답이 여럿이다
 *     (R002 샘플: "Who is one of the co-princes of Andorra?" → 실제로 둘이다).
 */
const NON_UNIQUE_MARKER = [
  // ★ R010에서 한 번 더 좁혔다. "one of the" 단독으로는 오차단이 났다.
  //   "…with the option to play as one of the characters, Ellen and Keats?" → 정답 Folklore
  //   여기서 "one of the characters" 는 **정답이 아니라 배경 설명**이다.
  //   ★ 그래서 계사(is/was/are/were) 바로 뒤에 오는 경우만 잡는다.
  //     R002의 사례 "Who **is one of** the co-princes of Andorra?" 는 그대로 걸린다.
  /\b(?:is|was|are|were)\s+one of\b/i,
];

/**
 * 정답 형식으로 게임에 쓸 수 없는 것.
 * ★ 정확 문자열 일치로만 판정하므로(guide 16절) 표기 변형이 무한한 정답은 쓸 수 없다.
 */
function badAnswerShape(correct: string): string[] {
  const reasons: string[] = [];
  const trimmed = correct.trim();

  // 범위형: "8-12 years", "3 to 5"
  if (/\d\s*(?:-|–|~|to)\s*\d/.test(trimmed)) reasons.push('answer_range');

  // 날짜 전체 표기: "November 29, 1972" / "July 1, 1863"
  if (
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/i.test(
      trimmed,
    )
  ) {
    reasons.push('answer_full_date');
  }

  // 자릿수가 큰 숫자: "703,800,000 years" — 표기 변형이 무한하다
  if (/\d[\d,]{6,}/.test(trimmed)) reasons.push('answer_large_number');

  // 소수점 근사값: "2.72"
  if (/^\d+\.\d+$/.test(trimmed)) reasons.push('answer_decimal');

  // 나열형 정답: "Francis, Bill, Zoey, and Louis"
  if (/,\s*(?:and|&)\s/i.test(trimmed) || (trimmed.match(/,/g) ?? []).length >= 2) {
    reasons.push('answer_list');
  }

  // ★ 서술형 정답. 단어 수로 판단한다.
  //   "Carthaginian general" 은 2단어지만 서술형이다 → 이것은 LLM 판정에 맡긴다.
  //   여기서는 확실한 것만: 6단어 이상
  if (trimmed.split(/\s+/).length >= 6) reasons.push('answer_too_long');

  // 정답이 너무 길다 (문자 수)
  if (trimmed.length > 40) reasons.push('answer_too_long_chars');

  return reasons;
}

/**
 * ★ 한국인이 맞히기 매우 어려운 카테고리.
 *
 * ★ 이것은 **버리지 않는다.** 표시만 해서 LLM 이 krAccessible 로 판정하게 한다.
 *   근거: R002 실측에서 코퍼스의 22.5%가 비디오 게임이고 그 상당수가 니치 게임의
 *   세부 설정 문제였다. 그러나 같은 카테고리 안에도 "슈퍼마리오를 만든 회사는?" 처럼
 *   충분히 상식적인 문제가 있다.
 *   ★ 카테고리 단위로 버리면 그런 문제까지 버린다. R002가 38.2%를 카테고리 단위로
 *     탈락시킨 것은 추산이었고, 실제 운영에서 그렇게 하면 손실이 크다.
 */
const HARD_CATEGORIES = [
  'Entertainment: Video Games',
  'Entertainment: Board Games',
  'Entertainment: Comics',
  'Entertainment: Cartoon & Animations',
  'Entertainment: Japanese Anime & Manga',
];

export function isHardCategory(category: string): boolean {
  return HARD_CATEGORIES.includes(category);
}

/**
 * 규칙 필터.
 *
 * ★ 통과 = "LLM 에 보낼 가치가 있다" 는 뜻일 뿐, "좋은 문제" 라는 뜻이 아니다.
 */
/** ★ 부정어 없는 보기 껍데기가 있는가. 거르지는 않지만 통계에 쓴다 */
export function hasOptionWrapper(question: string): boolean {
  return (
    OPTION_WRAPPER.some((re) => re.test(question)) &&
    !NEGATION.some((re) => re.test(stripQuoted(question)))
  );
}

export function ruleFilter(item: RawQuestion): FilterResult {
  const reasons: string[] = [];
  const q = item.question;

  // ── 1. 타입
  //   ★ 어댑터가 이미 걸렀지만, 다른 소스가 들어올 수 있으므로 여기서도 본다
  if (item.incorrect.length === 1) reasons.push('boolean_type');

  // ── 2. ★ 보기 참조 + 부정어 = 보기 없이는 답이 정해지지 않는다 (회복 불가)
  //   ★ 부정어는 인용구를 지운 문장에서 찾는다. 인용문 안의 "Do not" 은 질문의 부정이 아니다.
  const qNoQuotes = stripQuoted(q);
  const hasWrapper = OPTION_WRAPPER.some((re) => re.test(q));
  const hasNegation = NEGATION.some((re) => re.test(qNoQuotes));
  if (hasWrapper && hasNegation) reasons.push('references_options_negated');

  // 보기 집합 자체를 가리키는 표현은 부정어와 무관하게 회복 불가능하다
  if (OPTION_ONLY.some((re) => re.test(q))) reasons.push('references_option_set');

  // ★ 부정어 없는 껍데기는 거르지 않는다. LLM 이 주관식 어투로 고칠 수 있다.
  //   대신 통계를 위해 표시만 남긴다 (탈락 사유가 아니다).

  // ── 3. 정답이 여럿임을 문장이 드러내는 경우
  if (NON_UNIQUE_MARKER.some((re) => re.test(q))) reasons.push('non_unique_marker');

  // ── 4. 정답 형식
  reasons.push(...badAnswerShape(item.correct));

  // ── 5. 질문이 정답을 이미 담고 있는가 (드물지만 있다)
  //   ★ 대소문자를 무시하고, 정답이 3자 이상일 때만 본다.
  //     "a" 같은 짧은 정답은 어느 문장에나 들어 있다.
  const correctLower = item.correct.trim().toLowerCase();
  if (correctLower.length >= 3 && q.toLowerCase().includes(correctLower)) {
    reasons.push('answer_in_question');
  }

  // ── 6. 질문이 너무 짧거나 길다
  if (q.trim().length < 12) reasons.push('question_too_short');
  if (q.trim().length > 300) reasons.push('question_too_long');

  return { pass: reasons.length === 0, reasons: [...new Set(reasons)] };
}
