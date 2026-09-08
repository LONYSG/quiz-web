// =============================================================================
// 규칙 필터 테스트
//
// ★ 여기 있는 케이스는 대부분 **실측에서 나온 실제 문제**다.
//   R002 2-2의 샘플과 R010에서 오차단으로 발견한 것들이다.
//   ★ 필터를 다시 손볼 때 같은 실수를 반복하지 않게 하는 것이 이 파일의 목적이다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { ruleFilter, hasOptionWrapper } from './filter.js';
import { decodeEntities, makeSourceRef, toRawQuestion } from './adapters/opentdb.js';
import { checkGate, today } from './budget.js';
import type { RawQuestion } from './types.js';

function q(question: string, correct: string, extra: Partial<RawQuestion> = {}): RawQuestion {
  return {
    sourceId: 'opentdb',
    sourceRef: 'test',
    lang: 'en',
    question,
    correct,
    incorrect: ['a', 'b', 'c'],
    category: 'General Knowledge',
    difficulty: 'medium',
    license: 'CC-BY-SA-4.0',
    ...extra,
  };
}

describe('ruleFilter — 걸러야 하는 것 (보기 없이는 답이 정해지지 않는다)', () => {
  it.each([
    ['Which of the following is not a piece from West Side Story?', 'The Back Alley'],
    ['Which of these is NOT a character in Overwatch', 'Garen'],
    ['Which of the following is NOT a computer science algorithm?', 'Float Sort'],
    ['In CSS, which of these values CANNOT be used with the "position" property?', 'center'],
    ['Which of the following games was not a launch title for the Gamecube?', 'Super Mario Sunshine'],
  ])('부정어 + 보기 참조 → 탈락: %s', (question, correct) => {
    const r = ruleFilter(q(question, correct));
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('references_options_negated');
  });

  it('보기 집합 자체를 가리키면 탈락한다', () => {
    expect(ruleFilter(q('In the first Left 4 Dead, you can play as either of these four characters.', 'Francis')).pass).toBe(false);
  });

  it('"is one of" 는 정답이 여럿이다 (R002 샘플)', () => {
    const r = ruleFilter(q('Who is one of the co-princes of Andorra?', 'The president of France'));
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('non_unique_marker');
  });
});

describe('ruleFilter — 정답 형식 (게임이 정확 문자열 일치만 한다)', () => {
  it.each([
    ['범위형', 'What is the average lifespan of a domestic rabbit?', '8-12 years', 'answer_range'],
    ['날짜 전체', 'When was Pong released?', 'November 29, 1972', 'answer_full_date'],
    ['자릿수 큰 숫자', 'What is the half-life of Uranium-235?', '703,800,000 years', 'answer_large_number'],
    ['근사 소수', 'What is the approximate value of e?', '2.72', 'answer_decimal'],
    ['나열형', 'Who are the survivors?', 'Francis, Bill, Zoey, and Louis', 'answer_list'],
  ])('%s → 탈락', (_label, question, correct, reason) => {
    const r = ruleFilter(q(question, correct));
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain(reason);
  });

  it('연도 하나는 통과한다 (표기가 사실상 하나뿐이다)', () => {
    expect(ruleFilter(q('In what year did the Berlin Wall fall?', '1989')).pass).toBe(true);
  });
});

describe('★ ruleFilter — 걸러서는 안 되는 것 (오차단 방지)', () => {
  it.each([
    ['Which type of cutlery is most suited for eating soup?', 'Spoon'],
    ["Which European city is known as the 'City of Light'?", 'Paris'],
    ['Which small country is located between the borders of France and Spain?', 'Andorra'],
  ])('R002 반례: which 로 시작해도 전환 가능 → 통과: %s', (question, correct) => {
    expect(ruleFilter(q(question, correct)).pass).toBe(true);
  });

  it.each([
    ['Which of these characters is the mascot of the video game company SEGA?', 'Sonic the Hedgehog'],
    ['The medical term for the belly button is which of the following?', 'Umbilicus'],
    [
      'In physics, conservation of energy and conservation of momentum are both consequences of which of the following?',
      "Noether's Theorem",
    ],
  ])('★ R010 오차단: 부정어 없는 보기 껍데기 → 통과: %s', (question, correct) => {
    const r = ruleFilter(q(question, correct));
    expect(r.pass).toBe(true);
    // 껍데기 자체는 있다. LLM 이 주관식 어투로 고친다
    expect(hasOptionWrapper(question)).toBe(true);
  });

  it('★ R010 오차단: 인용구 안의 부정어는 질문의 부정이 아니다', () => {
    const question = 'Which of these games includes the phrase "Do not pass Go, do not collect $200"?';
    const r = ruleFilter(q(question, 'Monopoly'));
    expect(r.pass).toBe(true);
  });

  it('★ R010 오차단: 배경 설명의 "one of the" 는 정답 비유일성이 아니다', () => {
    const question =
      'Which of these games takes place in the Irish town of Doolin, with the option to play as one of the characters, Ellen and Keats?';
    expect(ruleFilter(q(question, 'Folklore')).pass).toBe(true);
  });
});

describe('ruleFilter — 그 밖의 방어', () => {
  it('boolean 타입은 걸러진다', () => {
    const r = ruleFilter(q('The Earth is flat.', 'False', { incorrect: ['True'] }));
    expect(r.reasons).toContain('boolean_type');
  });

  it('질문에 정답이 들어 있으면 걸러진다', () => {
    const r = ruleFilter(q('What is the capital of France, Paris or Lyon?', 'Paris'));
    expect(r.reasons).toContain('answer_in_question');
  });

  it('짧은 정답은 포함 검사에서 제외한다 (우연한 일치를 막는다)', () => {
    // "up" 이 question 안에 있지만 2자이므로 검사하지 않는다
    const r = ruleFilter(q('Which direction does a balloon float when released?', 'Up'));
    expect(r.reasons).not.toContain('answer_in_question');
  });
});

describe('OpenTDB 어댑터', () => {
  it('HTML 엔티티를 푼다', () => {
    expect(decodeEntities('&quot;Hello&quot;')).toBe('"Hello"');
    expect(decodeEntities('Don&#039;t')).toBe("Don't");
    expect(decodeEntities('Caf&eacute;')).toBe('Café');
    expect(decodeEntities('a &amp; b')).toBe('a & b');
  });

  it('★ &amp; 를 마지막에 푼다 (이중 인코딩 방어)', () => {
    // &amp;quot; → &quot; 가 되면 안 되고 &"  가 되어야 한다
    expect(decodeEntities('&amp;quot;')).toBe('&quot;');
  });

  it('★ sourceRef 는 같은 문제에 항상 같은 값을 준다 (중복 수확 방어)', () => {
    const a = makeSourceRef('What is 1+1?', '2');
    const b = makeSourceRef('What is 1+1?', '2');
    expect(a).toBe(b);
    expect(a).toMatch(/^otdb-[0-9a-f]{16}$/);
  });

  it('★ 질문이 다르면 다른 ref 가 나온다', () => {
    expect(makeSourceRef('Q1', 'A')).not.toBe(makeSourceRef('Q2', 'A'));
  });

  it('변환 시 엔티티가 풀린 상태로 들어간다', () => {
    const raw = toRawQuestion({
      type: 'multiple',
      difficulty: 'easy',
      category: 'General Knowledge',
      question: 'What does &quot;HTML&quot; stand for?',
      correct_answer: 'HyperText Markup Language',
      incorrect_answers: ['a &amp; b'],
    });
    expect(raw.question).toContain('"HTML"');
    expect(raw.incorrect[0]).toBe('a & b');
    expect(raw.license).toBe('CC-BY-SA-4.0');
  });
});

describe('예산 게이트 (Q-54)', () => {
  const base = {
    day: today(),
    items: 0,
    tokens: 0,
    calls: 0,
    rateLimited: false,
    rateLimitedAt: null,
    updatedAt: '',
  };

  it('평소에는 통과한다', () => {
    expect(checkGate({ ...base }).ok).toBe(true);
  });

  it('★ 오늘 429 를 맞았으면 시작하지 않는다', () => {
    const g = checkGate({ ...base, rateLimited: true, rateLimitedAt: 'x' });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('rate_limited_today');
  });

  it('건수 상한에 도달하면 시작하지 않는다', () => {
    const g = checkGate({ ...base, items: 100000 });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('item_limit');
  });

  it('토큰 상한에 도달하면 시작하지 않는다', () => {
    const g = checkGate({ ...base, tokens: 999_999_999 });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('token_limit');
  });
});
