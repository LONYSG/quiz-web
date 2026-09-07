// =============================================================================
// 힌트 생성 테스트
// 원본: R002 5-5의 테스트 케이스 표 24건. guide 70절이 요구하는 필수 테스트.
//
// ★ Q-38이 (A)에서 (B)로 확정되어 기대값을 고친 케이스가 있다. R004 4장에 내역을 남겼다.
//   #12 Van Gogh : V______  →  V__ G___
//   #13 New York : N______  →  N__ Y___
//   #20 iPhone 15: i_______ →  i_____ __
//   #21 Van Gogh 계열과 같은 이유로 영문 정답은 공백을 유지한다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { generateHint } from './hint.js';
import { normalizeAnswer } from './normalize.js';

describe('generateHint — R002 5-5 테스트 케이스 (Q-37/Q-38 확정 반영)', () => {
  const cases: Array<[no: number, answer: string, expected: string | null, why: string]> = [
    [1, '한글', 'ㅎㄱ', '★ guide 11절 명시 예시'],
    [2, 'Apple', 'A____', '★ guide 11절 명시 예시'],
    [3, '훈민정음', 'ㅎㅁㅈㅇ', '한글 초성'],
    [4, '대한민국', 'ㄷㅎㅁㄱ', '한글 초성'],
    [5, '미토콘드리아', 'ㅁㅌㅋㄷㄹㅇ', '한글 초성'],
    [6, '김치', 'ㄱㅊ', '2글자'],
    [7, '떡볶이', 'ㄸㅂㅇ', '쌍자음 초성 ㄸ 노출'],
    [8, '빵', null, '★ Q-37: 1글자'],
    [9, '달', null, '★ Q-37: 1글자'],
    [10, '서울', 'ㅅㅇ', '2글자. 좁지만 규칙대로 생성'],
    [11, '반 고흐', 'ㅂㄱㅎ', '한글은 공백 제거 (guide 11절)'],
    [12, 'Van Gogh', 'V__ G___', '★ Q-38 변경: 단어마다 첫 글자'],
    [13, 'New York', 'N__ Y___', '★ Q-38 변경: 단어마다 첫 글자'],
    [14, 'Paris', 'P____', '영문 한 단어'],
    [15, 'e', null, '★ Q-37: 1글자 (힌트=정답 방지)'],
    [16, 'C++', null, '★ Q-37 최종 방어선: 힌트가 정답과 같아짐'],
    [17, '1945', '____', '숫자는 전부 _. 자릿수만 노출'],
    [18, '3.14', '_.__', '기호 . 유지, 숫자 _'],
    [19, 'K리그', 'Kㄹㄱ', '첫 영문자 K 노출 + 한글 초성'],
    [20, 'iPhone 15', 'i_____ __', '★ Q-38 변경: 영문 모드이므로 공백 유지'],
    [21, '2차세계대전', '_ㅊㅅㄱㄷㅈ', '숫자 _ + 한글 초성'],
    [22, '유스티니아누스1세', 'ㅇㅅㅌㄴㅇㄴㅅ_ㅅ', '숫자 _ 포함'],
    [23, '주홍글씨', 'ㅈㅎㄱㅆ', '한글 초성'],
    [24, '스택', 'ㅅㅌ', '2글자 외래어'],
  ];

  for (const [no, answer, expected, why] of cases) {
    it(`#${no} ${JSON.stringify(answer)} → ${JSON.stringify(expected)} (${why})`, () => {
      expect(generateHint(answer)).toBe(expected);
    });
  }
});

describe('generateHint — 최종 방어선과 경계', () => {
  it('★ 어떤 입력에도 힌트가 정답을 그대로 노출하지 않는다 (guide 11절)', () => {
    const answers = [
      '한글', 'Apple', 'e', 'C++', '1945', '3.14', 'K리그', 'iPhone 15',
      '반 고흐', 'New York', '달', '빵', '스택', '!!!', '???', '---',
    ];
    for (const a of answers) {
      const hint = generateHint(a);
      if (hint === null) continue;
      // 정규화해서 비교한다. 같아지면 정답 노출이므로 실패다.
      expect(normalizeAnswer(hint)).not.toBe(normalizeAnswer(a));
    }
  });

  it('기호만인 정답은 가릴 것이 없어 힌트를 만들지 않는다', () => {
    expect(generateHint('!!!')).toBe(null);
    expect(generateHint('---')).toBe(null);
  });

  it('빈 문자열과 비문자열 입력은 null', () => {
    expect(generateHint('')).toBe(null);
    expect(generateHint('   ')).toBe(null);
    expect(generateHint(undefined)).toBe(null);
    expect(generateHint(123)).toBe(null);
  });

  it('한글이 섞이면 한글 모드가 되어 공백을 제거한다 (guide 11절)', () => {
    expect(generateHint('서울 특별시')).toBe('ㅅㅇㅌㅂㅅ');
  });

  it('영문만이면 단어 경계를 유지한다 (Q-38)', () => {
    expect(generateHint('The Lord of the Rings')).toBe('T__ L___ o_ t__ R____');
  });

  it('NFD 입력도 NFC로 정규화해 같은 힌트를 만든다', () => {
    expect(generateHint('훈민정음'.normalize('NFD'))).toBe('ㅎㅁㅈㅇ');
  });
});
