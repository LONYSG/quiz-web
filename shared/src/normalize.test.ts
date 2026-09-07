// =============================================================================
// 정답 정규화 테스트
// 원본: R002 4-5의 테스트 케이스 표 34건. guide 70절이 요구하는 필수 테스트.
//
// 케이스 29(아포스트로피 U+2019)는 Q-36이 "통일한다"로 확정되었으므로
// R002 표의 "현행=오답 / 권장안=정답" 중 권장안 쪽(정답)으로 기대값을 확정했다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { normalizeAnswer, buildNormalizedIndex } from './normalize.js';

/** 정답과 입력이 같은 것으로 판정되는가 */
const same = (answer: string, input: string) =>
  normalizeAnswer(answer) === normalizeAnswer(input);

describe('normalizeAnswer — R002 4-5 테스트 케이스 34건', () => {
  const cases: Array<[no: number, answer: string, input: string, expected: boolean, why: string]> = [
    [1, 'New York', 'newyork', true, 'guide 16절 명시 예시'],
    [2, 'New York', 'NEW YORK', true, '대소문자 무시'],
    [3, 'New York', 'new york', true, '대소문자 무시'],
    [4, 'New York', 'NewYork', true, '공백 무시'],
    [5, 'New York', 'New  York', true, '연속 공백 제거'],
    [6, 'New York', '  New York  ', true, '앞뒤 공백 제거'],
    [7, 'New York', 'New\tYork', true, '\\s 에 탭 포함'],
    [8, 'New York', 'New York', true, '\\s 에 NBSP 포함'],
    [9, 'New York', 'New　York', true, '전각 공백 → 제거'],
    [10, 'A+B', 'AB', false, '★ guide 16절 명시 예시 (특수문자 유지)'],
    [11, 'A+B', 'a+b', true, '대소문자만 차이'],
    [12, 'A+B', 'A + B', true, '공백 제거'],
    [13, 'A+B', 'A＋B', true, '전각 + → 반각'],
    // 14: NFD (자모 분리) 입력. iOS/macOS 사파리에서 실제로 발생한다
    [14, '훈민정음', '훈민정음'.normalize('NFD'), true, '★ NFC 정규화. iOS 대응'],
    [15, '훈민정음', '훈민정음'.normalize('NFC'), true, '동일'],
    [16, '훈민정음', '훈민 정음', true, '공백 제거'],
    [17, '훈민정음', '훈민정', false, '다른 문자열'],
    [18, '한글', 'ㅎㄱ', false, '자모만 입력은 다른 문자열'],
    [19, '한글', '﻿한글', true, '★ BOM 제거'],
    [20, '한글', '한​글', true, '★ 제로폭 공백 제거'],
    [21, 'Apple', 'ａｐｐｌｅ', true, '전각 → 반각 + 소문자'],
    [22, '100', '１００', true, '전각 숫자 → 반각'],
    [23, '대한민국', '대한민국!', false, '기호 유지'],
    [24, '대한민국', '대한민국', true, '동일'],
    [25, 'Café', 'Cafe', false, 'é ≠ e. 발음기호 유지'],
    [26, 'Café', 'café', true, '대소문자만 차이'],
    [27, 'Café', 'Café', true, '★ NFC 결합 (e + U+0301)'],
    [28, "don't", 'dont', false, '아포스트로피 유지'],
    [29, "don't", 'don’t', true, '★ Q-36 확정: 아포스트로피 변형 통일'],
    [30, '3.14', '3,14', false, '기호가 다름'],
    [31, '1945년', '1945', false, '★ 복수 정답 배열로 해결할 것'],
    [32, 'C++', 'c++', true, '대소문자만 차이'],
    [33, 'C++', 'C＋＋', true, '전각 + → 반각'],
    [34, '서울', '서울시', false, '★ 복수 정답 배열로 해결할 것'],
  ];

  for (const [no, answer, input, expected, why] of cases) {
    it(`#${no} ${JSON.stringify(answer)} vs ${JSON.stringify(input)} → ${expected ? '정답' : '오답'} (${why})`, () => {
      expect(same(answer, input)).toBe(expected);
    });
  }
});

describe('normalizeAnswer — 추가 방어', () => {
  it('Q-36: 하이픈 변형을 ASCII 하이픈으로 통일한다', () => {
    expect(same('e-mail', 'e‑mail')).toBe(true); // U+2011 non-breaking hyphen
    expect(same('e-mail', 'e–mail')).toBe(true); // U+2013 en dash
    expect(same('e-mail', 'e−mail')).toBe(true); // U+2212 minus sign
  });

  it('문자열이 아닌 입력은 빈 문자열로 취급한다', () => {
    expect(normalizeAnswer(undefined)).toBe('');
    expect(normalizeAnswer(null)).toBe('');
    expect(normalizeAnswer(42)).toBe('');
  });

  it('NFKC 변환은 하지 않는다 (guide 16절 기호 보존)', () => {
    // NFKC라면 ① → 1 로 바뀌어 같아진다. NFC만 쓰므로 달라야 한다.
    expect(same('1', '①')).toBe(false);
    // NFKC라면 ㈜ → (주) 로 바뀐다.
    expect(same('(주)', '㈱')).toBe(false);
  });

  it('같은 함수를 여러 번 호출해도 결과가 같다 (g 플래그 lastIndex 오염 없음)', () => {
    const input = '한​글';
    const first = normalizeAnswer(input);
    for (let i = 0; i < 5; i += 1) {
      expect(normalizeAnswer(input)).toBe(first);
    }
  });
});

describe('buildNormalizedIndex — 마스킹용 인덱스 매핑', () => {
  it('정규화 결과가 normalizeAnswer와 일치한다', () => {
    const samples = ['New York', '고 무 줄 아님?', 'A + B', "don’t", '한​글', 'Café'];
    for (const s of samples) {
      expect(buildNormalizedIndex(s).norm).toBe(normalizeAnswer(s));
    }
  });

  it('map으로 원문 구간을 되돌릴 수 있다', () => {
    const { rawNfc, norm, map } = buildNormalizedIndex('고 무 줄 아님?');
    const at = norm.indexOf('고무줄');
    expect(at).toBe(0);
    const start = map[at]!;
    const end = map[at + '고무줄'.length]!;
    // 원문에서 "고 무 줄"에 해당하는 구간이 잡혀야 한다
    expect(rawNfc.slice(start, end)).toBe('고 무 줄 ');
  });

  it('map 길이는 norm 길이 + 1 이고 마지막은 끝 보초다', () => {
    const { rawNfc, norm, map } = buildNormalizedIndex('New York');
    expect(map.length).toBe(norm.length + 1);
    expect(map[map.length - 1]).toBe(rawNfc.length);
  });

  it('이모지(서로게이트 페어)가 있어도 인덱스가 어긋나지 않는다', () => {
    const { rawNfc, norm, map } = buildNormalizedIndex('🍎 apple');
    const at = norm.indexOf('apple');
    expect(at).toBeGreaterThanOrEqual(0);
    const start = map[at]!;
    expect(rawNfc.slice(start, start + 5)).toBe('apple');
  });
});
