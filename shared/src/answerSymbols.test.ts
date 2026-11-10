// ★ R090 (D-347) — 특수문자 전부 무시 · 숫자 예외 · 짧은 글 예외 · 세트 안 겹침 빼기
import { describe, expect, it } from 'vitest';
import { flexAnswerSet, flexCanon, flexMatch, stripSymbols } from './answerFlex.js';
import { normalizeAnswer } from './normalize.js';
import { buildTopicMatcher, matchTopic } from './minigame/topics.js';

/** 퀴즈 판정과 같은 꼴: 정규화 일치 또는 flex */
function quizOk(answers: string[], sub: string): boolean {
  const norm = new Set(answers.map(normalizeAnswer));
  return norm.has(normalizeAnswer(sub)) || flexMatch(sub, norm, flexAnswerSet(answers, norm));
}

describe('R090 특수문자 무시', () => {
  it.each([
    [['Wi-Fi'], 'WiFi'],
    [['토르: 천둥의 신'], '토르 천둥의 신'],
    [["Kai'Sa"], 'Kaisa'],
    [['AC/DC'], 'ACDC'],
    [['7·4 남북공동성명'], '74 남북공동성명'],
    [['APT.'], 'APT'],
    [['ACDC'], 'AC/DC'],
    [['Mr. Children'], 'MrChildren'],
    [['R&B'], 'RB'],
    [['아이유!'], '아이유'],
    [['"작은 아씨들"'], '작은아씨들'],
    [['7.4 남북공동성명'], '74 남북공동성명'],
    [['7.4 남북공동성명'], '7·4 남북공동성명'],
    [['4.19 혁명'], '419혁명'],
    [['-40℃'], '-40'],
    [['30km/h'], '30kmh'],
  ])('%j ← %s 정답', (ans, sub) => expect(quizOk(ans, sub)).toBe(true));

  it.each([
    [['-40'], '40'],
    [['40'], '-40'],
    [['3.14'], '314'],
    [['C++'], 'C#'],
    [['C++'], 'C'],
    [['C'], 'C#'],
    [['1/2'], '12'],
    [['-40도'], '40도'],
    [['3.5배'], '35배'],
  ])('%j ← %s 오답', (ans, sub) => expect(quizOk(ans, sub)).toBe(false));

  it('숫자 예외 · 짧은 글 예외', () => {
    expect(stripSymbols('-40')).toBe('-40');
    expect(stripSymbols('영하-40')).toBe('영하-40');
    expect(stripSymbols('3.14')).toBe('3.14');
    expect(stripSymbols('1/2')).toBe('1/2');
    expect(stripSymbols('wi-fi')).toBe('wifi');
    expect(stripSymbols('c++')).toBe('c++');
    expect(stripSymbols('!!')).toBe('!!');
    expect(flexCanon('3.14km')).toBe('3.14km');
    expect(flexCanon('1,000원')).toBe('1000원');
  });

  it('세트 안 다른 항목과 지운 꼴이 같아지면 원꼴로만', () => {
    const m = buildTopicMatcher([
      { id: 'a', name: 'C++' },
      { id: 'b', name: 'C#' },
      { id: 'c', name: 'A-B' },
      { id: 'd', name: 'A:B' },
      { id: 'e', name: "Kai'Sa" },
    ]);
    expect(matchTopic(m, 'C++')).toBe('a');
    expect(matchTopic(m, 'C#')).toBe('b');
    expect(matchTopic(m, 'AB')).toBeNull();
    expect(matchTopic(m, 'A-B')).toBe('c');
    expect(matchTopic(m, 'A:B')).toBe('d');
    expect(matchTopic(m, 'kaisa')).toBe('e');
  });
});
