// =============================================================================
// 마스킹 테스트 — ★ Phase 6에서 구현할 예정이므로 전부 skip 상태다.
//
// 원본: R002 6-5의 테스트 케이스 표 16건.
// 구현을 시작할 때 describe.skip 을 describe 로 바꾸고 하나씩 통과시킨다.
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

describe.skip('maskAnswers — R002 6-5 테스트 케이스 16건 (Phase 6)', () => {
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

  // #14, #15, #16 은 maskAnswers 단독으로 검증할 수 없다.
  // 마스킹 여부를 결정하는 조건(경험자인가 / QUESTION_ACTIVE인가 / 발신자 본인인가)은
  // 서버의 chat.send 파이프라인에 있다. 따라서 서버 통합 테스트로 검증한다.
  // ★ 아래 세 항목은 server/src 의 통합 테스트에 같은 번호로 등록한다 (docs/10-TESTING.md).
  //   #14 미경험자가 정답을 치면 마스킹하지 않고 정답 처리한다  ← 가장 중요
  //   #15 QUESTION_RESOLVED 이후에는 마스킹하지 않는다
  //   #16 발신자 본인 화면에는 원문 + "가려짐" 표시
});

describe('maskAnswers — 미구현 상태 확인', () => {
  it('Phase 6 이전에는 호출 시 명확히 실패한다', () => {
    expect(() => maskAnswers('고무줄', ['고무줄'])).toThrow(/Phase 6/);
  });

  it('센티널은 사용자가 입력할 수 없는 사설 사용 영역 문자다 (Q-42)', () => {
    const cp = MASK_SENTINEL.codePointAt(0)!;
    expect(cp).toBeGreaterThanOrEqual(0xe000);
    expect(cp).toBeLessThanOrEqual(0xf8ff);
  });

  it('★ 센티널 길이는 1글자 고정이다 (정답 길이가 새지 않는다. Q-35)', () => {
    expect([...MASK_SENTINEL].length).toBe(1);
  });
});
