// =============================================================================
// 마스킹 테스트 — ★★ R016 (Phase 6) 에서 skip 을 풀고 전부 통과시켰다.
//
// 원본: R002 6-5의 테스트 케이스 표 16건.
//
// 전제: 현재 문제 진행 중(QUESTION_ACTIVE), 발신자는 이 문제를 이미 경험한 플레이어.
//       마스크 토큰은 MASK_SENTINEL 이다 (Q-42).
//
// ★ 케이스 10, 11은 "막지 못한다"를 명시적으로 문서화하기 위한 것이다.
//   실패가 아니라 "현재 규칙에서는 통과하지 않는 것이 정상"이다.
// ★ 케이스 14는 가장 중요하다. 마스킹이 정답 판정을 건드리지 않음을 보장한다 (R003 3-3).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { maskAnswers, MASK_SENTINEL } from './mask.js';
import { normalizeAnswer } from './normalize.js';

const M = MASK_SENTINEL;

describe('maskAnswers — R002 6-5 테스트 케이스 16건 (★ R016 에서 구현)', () => {
  const norm = (arr: string[]) => arr.map(normalizeAnswer);

  it('#1 정답 뒤에 조사가 붙은 경우', () => {
    expect(maskAnswers('고무줄인가', norm(['고무줄']))).toEqual({ text: `${M}인가`, masked: true });
  });

  it('#2 정답만 입력', () => {
    expect(maskAnswers('고무줄', norm(['고무줄']))).toEqual({ text: M, masked: true });
  });

  it('#3 ★ 정규화 매칭: 띄어 쓴 우회를 잡는다', () => {
    expect(maskAnswers('고 무 줄 아님?', norm(['고무줄']))).toEqual({
      text: `${M} 아님?`,
      masked: true,
    });
  });

  it('#4 부분 일치는 마스킹하지 않는다', () => {
    expect(maskAnswers('고무', norm(['고무줄']))).toEqual({ text: '고무', masked: false });
  });

  it('#5 한 메시지에 정답이 두 번 나오면 전부 치환', () => {
    expect(maskAnswers('이거 고무줄 아니야 고무줄', norm(['고무줄']))).toEqual({
      text: `이거 ${M} 아니야 ${M}`,
      masked: true,
    });
  });

  it('#6 영문 정답의 공백·대소문자 무시 매칭', () => {
    expect(maskAnswers('newyork ㅋㅋ', norm(['New York']))).toEqual({
      text: `${M} ㅋㅋ`,
      masked: true,
    });
  });

  it('#7 대문자 입력도 매칭', () => {
    expect(maskAnswers('NEW YORK 아님?', norm(['New York']))).toEqual({
      text: `${M} 아님?`,
      masked: true,
    });
  });

  it('#8 ★ 복수 정답: 어느 정답이 포함되어도 마스킹', () => {
    expect(maskAnswers('이성계지', norm(['태조', '이성계']))).toEqual({
      text: `${M}지`,
      masked: true,
    });
  });

  it('#9 ★ 긴 정답을 먼저 치환한다', () => {
    expect(maskAnswers('태조 이성계', norm(['태조', '태조 이성계']))).toEqual({
      text: M,
      masked: true,
    });
  });

  it('#10 초성 우회는 막지 못한다 (현재 규칙의 한계. 정상 동작)', () => {
    expect(maskAnswers('ㄱㅁㅈ', norm(['고무줄']))).toEqual({ text: 'ㄱㅁㅈ', masked: false });
  });

  it('#11 기호 삽입 우회는 막지 못한다 (현재 규칙의 한계. 정상 동작)', () => {
    expect(maskAnswers('고무-줄', norm(['고무줄']))).toEqual({ text: '고무-줄', masked: false });
  });

  it('#12 ★ Q-43: 2글자 이하 정답은 부분 포함으로 마스킹하지 않는다', () => {
    expect(maskAnswers('달라졌네', norm(['달']))).toEqual({ text: '달라졌네', masked: false });
  });

  it('#13 ★ Q-43: 2글자 이하 정답은 메시지 전체가 같을 때만 마스킹', () => {
    expect(maskAnswers('달', norm(['달']))).toEqual({ text: M, masked: true });
  });

  // ── ★ R016 추가 — Phase 0 에서 실측으로 잡았던 인덱스 결함의 회귀 방지

  it('★ 이모지(서로게이트 페어)가 앞에 있어도 구간이 밀리지 않는다', () => {
    // ★ Phase 0 실측: "🍎 apple" 에서 apple 을 찾으면 "pple" 이 나왔다.
    //   ★ map 을 코드 포인트가 아니라 **코드 유닛** 단위로 세어 고쳤다.
    expect(maskAnswers('🍎 apple 맞지', norm(['apple']))).toEqual({
      text: `🍎 ${M} 맞지`,
      masked: true,
    });
  });

  it('★★ 마스크 길이가 정답 길이를 드러내지 않는다 (Q-35)', () => {
    const short = maskAnswers('고무줄', norm(['고무줄']));
    const long = maskAnswers('아리스토텔레스철학', norm(['아리스토텔레스철학']));
    expect(short.text).toBe(long.text);
    expect([...short.text].length).toBe(1);
  });

  it('★ 매칭이 없으면 원문을 그대로 돌려준다 (NFC 정규화만 적용)', () => {
    const r = maskAnswers('그냥 잡담', norm(['고무줄']));
    expect(r).toEqual({ text: '그냥 잡담', masked: false });
  });

  it('★ 빈 메시지·빈 정답 목록에서 터지지 않는다', () => {
    expect(maskAnswers('   ', norm(['고무줄']))).toEqual({ text: '   ', masked: false });
    expect(maskAnswers('고무줄', [])).toEqual({ text: '고무줄', masked: false });
  });

  // #14, #15, #16 은 maskAnswers 단독으로 검증할 수 없다.
  // 마스킹 여부를 결정하는 조건(경험자인가 / QUESTION_ACTIVE인가 / 발신자 본인인가)은
  // 서버의 chat.send 파이프라인에 있다. 따라서 서버 통합 테스트로 검증한다.
  // ★ 아래 세 항목은 server/src 의 통합 테스트에 같은 번호로 등록한다 (docs/10-TESTING.md).
  //   #14 미경험자가 정답을 치면 마스킹하지 않고 정답 처리한다  ← 가장 중요
  //   #15 QUESTION_RESOLVED 이후에는 마스킹하지 않는다
  //   #16 발신자 본인 화면에는 원문 + "가려짐" 표시
});

describe('maskAnswers — 센티널 규약', () => {
  it('센티널은 사용자가 입력할 수 없는 사설 사용 영역 문자다 (Q-42)', () => {
    const cp = MASK_SENTINEL.codePointAt(0)!;
    expect(cp).toBeGreaterThanOrEqual(0xe000);
    expect(cp).toBeLessThanOrEqual(0xf8ff);
  });

  it('★ 센티널 길이는 1글자 고정이다 (정답 길이가 새지 않는다. Q-35)', () => {
    expect([...MASK_SENTINEL].length).toBe(1);
  });
});
