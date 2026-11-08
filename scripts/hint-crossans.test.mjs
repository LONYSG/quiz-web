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
    // G033: 파랑은 COMMON 에 들어갔다(V034 CV-141) — 낱말 단위 규칙만 보려고 흔한 낱말 목록을 비운다
    expect(crossAnswers({ id: 1640, hint: '빨강과 파랑의 중간색이다.', answerNorm: '보라' }, A, { common: [] }).map((x) => x.id)).toEqual(['1639']);
    expect(crossAnswers({ id: 1859, hint: '콩과 식물의 대표적인 공생 상대다.', answerNorm: '뿌리혹박테리아' }, A).map((x) => x.id)).toEqual(['2117']);
  });
  it('3글자 이상은 글자 그대로 · 흔한 낱말 · 자기 정답 무리 · 낱말 속 2글자(해마다)는 뺀다', () => {
    expect(crossAnswers({ id: 1, hint: '베토벤의 교향곡과 고양이 · 해마다 열린다.', answerNorm: 'x' }, A).map((x) => x.answer)).toEqual(['베토벤']);
    expect(crossAnswers({ id: 2, hint: '보라색 포도', answerNorm: '보라' }, A)).toEqual([]);
  });
});

// G033 — V034 CV-141: COMMON 12 · R1(낱말 경계) · R2(긴 이름의 일부)
describe('crossAnswers — G033 R1 · R2 · COMMON(V034 오탐 18 중 6 · core 5 그대로)', () => {
  const B = [
    { id: 5109, norm: '달리아', answer: '달리아' }, { id: 1566, norm: '마우스', answer: '마우스' }, { id: 5203, norm: '미키마우스', answer: '미키 마우스' },
    { id: 4051, norm: '케니', answer: '케니' }, { id: 3168, norm: '브레이킹', answer: '브레이킹' }, { id: 1627, norm: '마리오', answer: '마리오' },
    { id: 1546, norm: '슈퍼맨', answer: '슈퍼맨' }, { id: 1639, norm: '파랑', answer: '파랑' }, { id: 670, norm: '녹색', answer: '녹색' },
    { id: 2331, norm: '압록강', answer: '압록강' }, { id: 727, norm: '미야자키하야오', answer: '미야자키 하야오' }, { id: 4102, norm: '페이커', answer: '페이커' },
    { id: 752, norm: '바로크', answer: '바로크' }, { id: 2118, norm: '기생', answer: '기생' },
  ];
  const ids = (id, hint) => crossAnswers({ id, hint, answerNorm: 'x' }, B).map((x) => x.id);
  it('오탐 6 을 거른다', () => {
    expect(ids(4593, '아프리카 서벌 피를 섞은 사바나와 달리 아시아 삵의 피를 이었다.')).toEqual([]);
    expect(ids(1420, "'라이온 킹'이 잇따라 크게 흥행하며 미키 마우스 회사의 손그림 애니메이션이 최고 전성기를 누린 시기다.")).toEqual(['5203']);
    expect(ids(1138, "케니 G 의 'Going Home' 으로 귀에 익은 관악기다.")).toEqual([]);
    expect(ids(4223, "'브레이킹 배드' 에서 월터 화이트가 쓴 이름이다.")).toEqual([]);
    expect(ids(3555, "'슈퍼 마리오 브라더스' 열풍을 이끈 닌텐도의 8비트 게임기다.")).toEqual([]);
    expect(ids(6200, "딸과 함께 '슈퍼맨이 돌아왔다' 에 나와 친숙하다.")).toEqual([]);
  });
  it('COMMON 12(파랑 · 녹색 …)는 세지 않는다', () => {
    expect(ids(569, '빨강·노랑·초록·파랑·보라 다섯 기본 색')).toEqual([]);
    expect(ids(3460, '녹색 바탕에 바다의 인어 세이렌 얼굴을 그린 로고')).toEqual([]);
  });
  it('core 5 는 그대로 잡는다', () => {
    expect(ids(2351, '압록강 상류와 두만강 하류에 여진족을 막으려 새로 둔 행정 구역')).toEqual(['2331']);
    expect(ids(3379, '미야자키 하야오의 영화로, 사슴 모습을 한 숲의 신이 나온다.')).toEqual(['727']);
    expect(ids(6250, "'페이커' 이상혁이 뛰는 한국 리그 오브 레전드 명문 팀이다.")).toEqual(['4102']);
    expect(ids(4322, "오라토리오 '메시아'의 '할렐루야' 합창으로 유명한 바로크 작곡가다.")).toEqual(['752']);
    expect(ids(5920, '남원 기생의 딸이 이몽룡과의 사랑을 지키는 이야기다.')).toEqual(['2118']);
  });
});

// G034 — 484 활성 뒤 COMMON 13(설명에 꼭 쓰이는 갈래·일반어)
describe('crossAnswers — G034 COMMON 13', () => {
  const B = [
    { id: 6838, norm: '애니메이션', answer: '애니메이션' }, { id: 7299, norm: '고려가요', answer: '고려가요' },
    { id: 7046, norm: '피고인', answer: '피고인' }, { id: 7188, norm: '카이퍼벨트', answer: '카이퍼 벨트' },
  ];
  const ids = (id, hint) => crossAnswers({ id, hint, answerNorm: 'x' }, B).map((x) => x.id);
  it('갈래·일반어는 세지 않는다', () => {
    expect(ids(1420, "'라이온 킹'이 흥행하며 손그림 애니메이션이 전성기를 누린 시기다.")).toEqual([]);
    expect(ids(4510, '지은이가 밝혀진 유일한 고려가요로, 궁중 음악으로 불렸다.')).toEqual([]);
    expect(ids(3159, '피고인이나 변호인이 청구하면 법원이 허가하는 석방 제도다.')).toEqual([]);
  });
  it('고유 이름은 그대로 잡는다', () => {
    expect(ids(2668, '명왕성을 지난 뒤 카이퍼 벨트 천체 아로코스까지 찍었다.')).toEqual(['7188']);
  });
});
