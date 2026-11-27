import { describe, expect, it } from 'vitest';
import {
  BELT_POINTS,
  BELT_STARTS,
  beltLabel,
  soloExplainMs,
  soloAnswerFits,
  soloItemCounts,
  soloItemsCost,
  beltNextNeed,
  beltPointsDue,
  beltStepForBest,
  nextBeltStep,
  soloGradeFor,
  soloGradeOrder,
  soloTimeMs,
} from './solo.js';

const s = (n: number) => '가'.repeat(n);

describe('R118 솔로 시간 식(docs/24 4-4)', () => {
  it('짧은 문제 = 8초(아래 끝)', () => {
    expect(soloTimeMs(s(20), '서울')).toBe(8000);
  });
  it('보통 문제(54자 · 4자) ≈ 9초 · 긴 문제(69자 · 9자) ≈ 11.5초', () => {
    expect(soloTimeMs(s(54), '가나다라')).toBe(9200);
    expect(soloTimeMs(s(69), s(9))).toBe(11600);
  });
  it('정답 띄어쓰기는 세지 않는다', () => {
    expect(soloTimeMs(s(30), '가나다 라마바')).toBe(soloTimeMs(s(30), '가나다라마바'));
    expect(soloTimeMs(s(30), '가나다라마바')).toBe(8400);
  });
  it('13초를 넘지 않는다', () => {
    expect(soloTimeMs(s(300), s(30))).toBe(13000);
  });
});

describe('R118 어려움 표(SOLO_RAMP · 4-3)', () => {
  it('맞힌 개수마다 등급', () => {
    expect(soloGradeFor(0, 0.9)).toBe(1);
    expect(soloGradeFor(4, 0.9)).toBe(1);
    expect(soloGradeFor(5, 0.1)).toBe(1);
    expect(soloGradeFor(5, 0.9)).toBe(2);
    expect(soloGradeFor(12, 0.0)).toBe(2);
    expect(soloGradeFor(17, 0.9)).toBe(3);
    expect(soloGradeFor(25, 0.5)).toBe(3);
    expect(soloGradeFor(35, 0.9)).toBe(4);
    expect(soloGradeFor(45, 0.1)).toBe(4);
    expect(soloGradeFor(60, 0.9)).toBe(5);
    expect(soloGradeFor(99, 0.1)).toBe(4);
  });
  it('50~59 = 4가 70% · 5가 30%', () => {
    expect(soloGradeFor(55, 0.69)).toBe(4);
    expect(soloGradeFor(55, 0.71)).toBe(5);
  });
  it('모자라면 아래 먼저 · 그다음 위', () => {
    expect(soloGradeOrder(3)).toEqual([3, 2, 1, 4, 5]);
    expect(soloGradeOrder(1)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('R118 띠 셈(5-1 안 A · 5-3)', () => {
  it('25칸 · 첫 판 = 화이트 0 · 3 = 화이트 I · 15 = 블루 · 50 = 블랙 · 80 = 블랙 IV', () => {
    expect(BELT_STARTS.length).toBe(25);
    expect(BELT_POINTS.length).toBe(25);
    expect(beltStepForBest(0)).toBe(0);
    expect(beltStepForBest(2)).toBe(0);
    expect(beltStepForBest(3)).toBe(1);
    expect(beltStepForBest(14)).toBe(4);
    expect(beltStepForBest(15)).toBe(5);
    expect(beltStepForBest(31)).toBe(10);
    expect(beltStepForBest(50)).toBe(20);
    expect(beltStepForBest(69)).toBe(22);
    expect(beltStepForBest(200)).toBe(24);
  });
  it('이름', () => {
    expect(beltLabel(null)).toBe('띠 없음');
    expect(beltLabel(0)).toBe('화이트벨트 I'); // ★ R123 I~V
    expect(beltLabel(7)).toBe('블루벨트 III');
    expect(beltLabel(24)).toBe('블랙벨트 V');
  });
  it('받은 띠는 내려가지 않는다(기준이 올라 다시 세도)', () => {
    expect(nextBeltStep(null, 0)).toBe(0);
    expect(nextBeltStep(7, 3)).toBe(7);
    expect(nextBeltStep(7, 30)).toBe(10);
  });
  it('다음 칸까지', () => {
    expect(beltNextNeed(null, 0)).toEqual({ step: 0, need: 0 });
    expect(beltNextNeed(0, 1)).toEqual({ step: 1, need: 2 });
    expect(beltNextNeed(5, 16)).toEqual({ step: 6, need: 2 });
    expect(beltNextNeed(24, 99)).toBeNull();
  });
});

describe('R118 띠 포인트 차액(5-5 P2)', () => {
  it('첫 판 10P · 단계 +5P · 새 띠 +40P', () => {
    expect(beltPointsDue(0, 0)).toBe(10);
    expect(beltPointsDue(1, 10)).toBe(5);
    expect(beltPointsDue(5, 30)).toBe(40);
    expect(beltPointsDue(20, 0)).toBe(250);
  });
  it('여러 칸을 뛰어도 차액 한 번 · 처음 높은 칸으로 와도 아래 칸 몫까지', () => {
    expect(beltPointsDue(10, 10)).toBe(120);
    expect(beltPointsDue(10, 0)).toBe(130);
  });
  it('거두지 않는다 — 이미 받은 것이 더 많으면 0', () => {
    expect(beltPointsDue(3, 90)).toBe(0);
    expect(beltPointsDue(0, 10)).toBe(0);
  });
});

describe('★ R123 — 해설 시간 · 정답 글자 · 아이템', () => {
  it('해설 = 정답 + 해설 글자(띄어쓰기 뺌) 12자/초 · 4~12초', () => {
    expect(soloExplainMs('가', null)).toBe(4000);
    expect(soloExplainMs('가나다', '라'.repeat(93))).toBe(8000);
    expect(soloExplainMs('가', '나'.repeat(500))).toBe(12000);
  });
  it('정답 띄어쓰기 빼고 6글자까지', () => {
    expect(soloAnswerFits('세종 대왕')).toBe(true);
    expect(soloAnswerFits('가나다라마바')).toBe(true);
    expect(soloAnswerFits('가나다 라마바사')).toBe(false);
    expect(soloAnswerFits('헤이플릭 한계')).toBe(true); // s 가 든 정규식 실수(/s+/) 막기
    expect(soloAnswerFits('Hey Ya!')).toBe(true);
  });
  it('아이템 개수 다듬기 · 값', () => {
    expect(soloItemCounts({ hint: 5, initial: -1, skip: 2.5, x: 3 })).toEqual({ hint: 3, initial: 0, skip: 0 });
    expect(soloItemsCost({ hint: 1, initial: 1, skip: 1 })).toBe(45);
  });
  it('벨트 숫자 I~V(첫 칸 I · 끝 칸 V)', () => {
    expect([0, 4, 5, 9, 24].map(beltLabel)).toEqual(['화이트벨트 I', '화이트벨트 V', '블루벨트 I', '블루벨트 V', '블랙벨트 V']);
  });
});
