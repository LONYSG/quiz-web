// G029 — H12 crossans 단위 테스트
import { describe, expect, it } from 'vitest';
import { crossAnswers } from './hint-crossans.mjs';

const A = [
  { id: 1639, norm: '파랑', answer: '파랑' },
  { id: 2117, norm: '공생', answer: '공생' },
  { id: 5149, norm: '고양이', answer: '고양이' },
  { id: 3940, norm: '베토벤', answer: '베토벤' },
  { id: 900, norm: '해마', answer: '해마' },
  { id: 901, norm: '보라', answer: '보라' },
];

describe('crossAnswers — 힌트 속 다른 활성 문항 정답', () => {
  it('1640 보라 힌트의 "파랑" · 1859 의 "공생" 을 잡는다(2글자는 낱말 단위 · 조사 뗌)', () => {
    expect(crossAnswers({ id: 1640, hint: '빨강과 파랑의 중간색이다.', answerNorm: '보라' }, A).map((x) => x.id)).toEqual(['1639']);
    expect(crossAnswers({ id: 1859, hint: '콩과 식물의 대표적인 공생 상대다.', answerNorm: '뿌리혹박테리아' }, A).map((x) => x.id)).toEqual(['2117']);
  });
  it('3글자 이상은 글자 그대로 · 흔한 낱말 · 자기 정답 무리 · 낱말 속 2글자(해마다)는 뺀다', () => {
    expect(crossAnswers({ id: 1, hint: '베토벤의 교향곡과 고양이 · 해마다 열린다.', answerNorm: 'x' }, A).map((x) => x.answer)).toEqual(['베토벤']);
    expect(crossAnswers({ id: 2, hint: '보라색 포도', answerNorm: '보라' }, A)).toEqual([]);
  });
});
