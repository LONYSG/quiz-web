import { describe, expect, it } from 'vitest';
import { splitSentences } from './sentences.js';

describe('★ splitSentences (R035)', () => {
  it('한 문장은 그대로', () => {
    expect(splitSentences('조선을 건국한 첫 번째 왕은?')).toEqual(['조선을 건국한 첫 번째 왕은?']);
  });
  it('두 문장은 둘로', () => {
    expect(splitSentences('1443년에 만들었다. 이 문자의 이름은?')).toEqual(['1443년에 만들었다.', '이 문자의 이름은?']);
  });
  it('물음표·느낌표·말줄임', () => {
    expect(splitSentences('정말일까?! 그렇다… 무엇인가?')).toEqual(['정말일까?!', '그렇다…', '무엇인가?']);
  });
  it('숫자 속 점은 나누지 않는다', () => {
    expect(splitSentences('원주율은 약 3.14 이다. 이 상수의 이름은?')).toEqual(['원주율은 약 3.14 이다.', '이 상수의 이름은?']);
  });
  it('붙은 약어(U.S.A)·이니셜(J. K.)은 나누지 않는다', () => {
    expect(splitSentences('U.S.A 의 수도는?')).toEqual(['U.S.A 의 수도는?']);
    expect(splitSentences('J. K. 롤링이 쓴 소설은?')).toEqual(['J. K. 롤링이 쓴 소설은?']);
    expect(splitSentences('Dr. Who 의 주인공은?')).toEqual(['Dr. Who 의 주인공은?']);
  });
  it('따옴표·괄호 안의 문장 끝은 나누지 않는다', () => {
    expect(splitSentences('"왜?" 라고 물은 사람은?')).toEqual(['"왜?" 라고 물은 사람은?']);
    expect(splitSentences('그는 (정말? 그렇다.) 말했다. 누구인가?')).toEqual(['그는 (정말? 그렇다.) 말했다.', '누구인가?']);
  });
  it('인용문 안의 문장 끝은 나누지 않는다 (인용은 한 덩어리)', () => {
    expect(splitSentences('“나는 왕이다.” 이 대사의 주인은?')).toEqual(['“나는 왕이다.” 이 대사의 주인은?']);
  });
  it('문장 끝 뒤 닫는 괄호는 앞 문장에 붙는다', () => {
    expect(splitSentences('정답은 하나다.) 다음 문장?')).toEqual(['정답은 하나다.)', '다음 문장?']);
  });
  it('빈 입력', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
  it('이어 붙이면 원문 글자와 같다', () => {
    const t = '첫째 문장이다. 둘째 문장은? 셋째!';
    expect(splitSentences(t).join(' ')).toBe(t);
  });
});
