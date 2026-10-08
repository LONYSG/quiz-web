import { describe, expect, it } from 'vitest';
import { nicknameFits, nicknameUnits, NICKNAME_MAX_UNITS } from './nickname.js';

describe('닉네임 폭 (R040 · 건우: 한글 1 · 영어·숫자 0.8 · 8칸)', () => {
  it('한글만 8자까지', () => {
    expect(nicknameFits('가나다라마바사아')).toBe(true);
    expect(nicknameFits('가나다라마바사아자')).toBe(false);
  });
  it('영어·숫자만 10자까지', () => {
    expect(nicknameFits('abcdefghij')).toBe(true);
    expect(nicknameFits('abcde12345')).toBe(true);
    expect(nicknameFits('abcdefghijk')).toBe(false);
  });
  it('섞으면 그 사이 — 0.1칸 단위로 정확히 센다', () => {
    expect(nicknameUnits('가나다abc')).toBe(5.4);
    expect(nicknameFits('가나다라마bc12')).toBe(false); // 5 + 3.2 = 8.2
    expect(nicknameFits('가나다라마abc')).toBe(true); // 5 + 2.4 = 7.4
    expect(nicknameFits('가나다라마바ab')).toBe(true); // 6 + 1.6 = 7.6
    expect(nicknameFits('가나다라마바사a')).toBe(true); // 7.8
    expect(nicknameFits('가나다라마바사ab')).toBe(false); // 8.6
  });
  it('기호·공백은 0.8 · 이모지 1.2 · 결합 문자 0', () => {
    expect(nicknameUnits('a b')).toBe(2.4);
    expect(nicknameUnits('😀')).toBe(1.2);
    expect(nicknameUnits('👍🏻')).toBe(1.2); // 피부색 조각은 앞 그림에 붙는다
    expect(nicknameUnits('❤️')).toBe(1.2); // 변형 선택자 0
    expect(nicknameUnits('漢字')).toBe(2);
  });
  it('한도 값', () => {
    expect(NICKNAME_MAX_UNITS).toBe(8);
  });
});
