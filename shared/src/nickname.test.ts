import { describe, expect, it } from 'vitest';
import { nicknameFits, nicknameUnits, NICKNAME_MAX_UNITS } from './nickname.js';

describe('닉네임 폭 (R040 규칙 · R041 한도 10칸 — 건우: 한글 1 · 영어·숫자 0.8)', () => {
  it('한글만 10자까지', () => {
    expect(nicknameFits('가나다라마바사아자차')).toBe(true);
    expect(nicknameFits('가나다라마바사아자차카')).toBe(false);
  });
  it('영어·숫자만 12자까지', () => {
    expect(nicknameFits('abcdefghijkl')).toBe(true);
    expect(nicknameFits('abcdef123456')).toBe(true);
    expect(nicknameFits('abcdefghijklm')).toBe(false);
  });
  it('섞으면 그 사이 — 0.1칸 단위로 정확히 센다', () => {
    expect(nicknameUnits('가나다abc')).toBe(5.4);
    expect(nicknameFits('가나다라마바사bc12')).toBe(false); // 7 + 3.2 = 10.2
    expect(nicknameFits('가나다라마바사abc')).toBe(true); // 7 + 2.4 = 9.4
    expect(nicknameFits('가나다라마바사아자a')).toBe(true); // 9.8
    expect(nicknameFits('가나다라마바사아자ab')).toBe(false); // 10.6
  });
  it('기호·공백은 0.8 · 이모지 1.2 · 결합 문자 0', () => {
    expect(nicknameUnits('a b')).toBe(2.4);
    expect(nicknameUnits('😀')).toBe(1.2);
    expect(nicknameUnits('👍🏻')).toBe(1.2); // 피부색 조각은 앞 그림에 붙는다
    expect(nicknameUnits('❤️')).toBe(1.2); // 변형 선택자 0
    expect(nicknameUnits('漢字')).toBe(2);
  });
  it('한도 값', () => {
    expect(NICKNAME_MAX_UNITS).toBe(10);
  });
});
