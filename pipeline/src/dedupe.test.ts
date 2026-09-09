// =============================================================================
// 중복 판정과 카테고리 트리 단위 테스트 (R011)
//
// ★ 여기 있는 케이스는 전부 **R011 실측에서 실제로 나온 것**이다.
//   임의로 만든 예가 아니다. 실측 케이스를 고정해야 회귀를 잡을 수 있다.
// =============================================================================

import { describe, expect, it } from 'vitest';

import { MAJORS, MIDS, enabledMids, generationOrder, treeStats } from './categories.js';
import { findDuplicates, questionKey, similarity, type DupeInput } from './dedupe.js';
import { buildSlots } from './gen-prompt.js';
import { sanitizeVariants } from './rules.js';
import { difficultyBucket, makeGenRef } from './generate.js';

const item = (
  ref: string,
  midKey: string,
  majorKey: string,
  question: string,
  answers: string[],
): DupeInput => ({ ref, midKey, majorKey, question, answers });

describe('카테고리 트리', () => {
  it('중분류의 major 가 모두 실재하는 대분류를 가리킨다', () => {
    const keys = new Set(MAJORS.map((m) => m.key));
    for (const mid of MIDS) expect(keys.has(mid.major)).toBe(true);
  });

  it('중분류 key 가 중복되지 않는다', () => {
    const keys = MIDS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('★ 모든 중분류에 소분류가 둘 이상 있다 — 소분류가 생성 단위다', () => {
    for (const mid of MIDS) expect(mid.subs.length).toBeGreaterThanOrEqual(2);
  });

  it('★ 같은 중분류 안에서 소분류 이름이 겹치지 않는다', () => {
    for (const mid of MIDS) {
      expect(new Set(mid.subs).size).toBe(mid.subs.length);
    }
  });

  it('생성 순서는 mustSample 을 앞에 둔다 (한도가 부족할 때를 위해)', () => {
    const order = generationOrder();
    const mustCount = enabledMids().filter((m) => m.mustSample).length;
    expect(mustCount).toBeGreaterThan(0);
    for (let i = 0; i < mustCount; i += 1) expect(order[i]!.mustSample).toBe(true);
  });

  it('★ 생성 순서는 대분류를 번갈아 돈다 — 중간에 끊겨도 골고루 남는다', () => {
    const order = generationOrder();
    const mustCount = enabledMids().filter((m) => m.mustSample).length;
    // mustSample 이후 7개는 서로 다른 대분류여야 한다 (대분류가 7개다)
    const window = order.slice(mustCount, mustCount + MAJORS.length).map((m) => m.major);
    expect(new Set(window).size).toBe(window.length);
  });

  it('생성 순서에 모든 활성 중분류가 정확히 한 번 나온다', () => {
    const order = generationOrder();
    expect(order.length).toBe(enabledMids().length);
    expect(new Set(order.map((m) => m.key)).size).toBe(order.length);
  });

  it('treeStats 가 실제 수와 맞는다', () => {
    const s = treeStats();
    expect(s.majors).toBe(MAJORS.length);
    expect(s.mids).toBe(MIDS.length);
    expect(s.subs).toBe(MIDS.reduce((n, m) => n + m.subs.length, 0));
  });
});

describe('슬롯 생성', () => {
  const mid = MIDS.find((m) => m.key === 'kr-history')!;

  it('중분류당 요청한 수만큼 슬롯을 만든다', () => {
    expect(buildSlots([mid], 3)).toHaveLength(3);
  });

  it('★ 한 요청 안에서 소분류가 겹치지 않는다 — 겹치면 그 자리에서 중복이 난다', () => {
    const slots = buildSlots([mid], 3);
    expect(new Set(slots.map((s) => s.sub)).size).toBe(3);
  });

  it('★ subOffset 을 주면 다른 소분류가 나온다 — 두 번째 순회에서 중복을 막는다', () => {
    const a = buildSlots([mid], 2, 0).map((s) => s.sub);
    const b = buildSlots([mid], 2, 2).map((s) => s.sub);
    for (const sub of b) expect(a).not.toContain(sub);
  });

  it('소분류 수보다 많이 요청하면 돌려 쓴다 (오류를 내지 않는다)', () => {
    const slots = buildSlots([mid], mid.subs.length + 2);
    expect(slots).toHaveLength(mid.subs.length + 2);
    expect(slots.every((s) => mid.subs.includes(s.sub))).toBe(true);
  });

  it('slotId 가 고유하다 — 응답을 요청과 맞추는 열쇠다', () => {
    const slots = buildSlots(MIDS.slice(0, 10), 2);
    expect(new Set(slots.map((s) => s.slotId)).size).toBe(slots.length);
  });
});

describe('questionKey — 질문 동일성', () => {
  it('★ 따옴표 종류만 다른 질문을 같다고 본다 (R011 실측: 윤동주 서시)', () => {
    const a = "'죽는 날까지 하늘을 우러러'라는 구절로 시작하는 윤동주의 대표 시는?";
    const b = '"죽는 날까지 하늘을 우러러"라는 구절로 시작하는 윤동주의 대표 시는?';
    expect(questionKey(a)).toBe(questionKey(b));
    expect(similarity(a, b)).toBe(1);
  });

  it('내용이 다르면 다르다', () => {
    expect(questionKey('한글을 창제한 왕은?')).not.toBe(questionKey('훈민정음을 만든 왕은?'));
  });
});

describe('★ 중복 판정 — R011 실측 케이스', () => {
  it('★ 같은 중분류 + 같은 정답 + 문장까지 같으면 exact (동일 문제)', () => {
    const r = findDuplicates([
      item('a', 'kr-lit', 'korea', "'죽는 날까지'로 시작하는 윤동주의 시는?", ['서시']),
      item('b', 'kr-lit', 'korea', '"죽는 날까지"로 시작하는 윤동주의 시는?', ['서시']),
    ]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.level).toBe('exact');
    expect(r.pairs[0]!.verdict).toBe('duplicate');
  });

  it('★ 같은 중분류 + 같은 정답이면 문장이 달라도 의심으로 올린다 (건우 원칙)', () => {
    // 실측: 토이 스토리 (유사도 0.13). 문장은 전혀 다른데 같은 문제였다
    const r = findDuplicates([
      item('a', 'animation', 'arts', "'우디'와 '버즈'가 주인공인 픽사 3D 애니메이션은?", ['토이 스토리']),
      item('b', 'animation', 'arts', '1995년 세계 최초의 극장용 장편 3D 애니메이션은?', ['토이 스토리']),
    ]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.level).toBe('same-mid');
    expect(['duplicate', 'suspect']).toContain(r.pairs[0]!.verdict);
    // ★ 유사도가 낮다는 것이 핵심이다. 유사도만으로는 중복을 못 걸러낸다
    expect(r.pairs[0]!.similarity).toBeLessThan(0.5);
  });

  it('★ 정답이 다르면 후보가 되지 않는다 — 후보 추리기의 본체', () => {
    const r = findDuplicates([
      item('a', 'football', 'sports', '축구 한 팀의 선수는 몇 명인가?', ['11', '열한']),
      item('b', 'baseball', 'sports', '야구 한 팀의 수비 인원은 몇 명인가?', ['9', '아홉']),
    ]);
    expect(r.candidatePairs).toBe(0);
    expect(r.pairs).toHaveLength(0);
  });

  it('★ 표기 변형 하나만 겹쳐도 후보가 된다 — 대표 표기만 보면 놓친다', () => {
    const r = findDuplicates([
      item('a', 'chemistry', 'science', '원소 기호 Au 의 원소는?', ['금', 'Gold']),
      item('b', 'chemistry', 'science', '올림픽 1위에게 주는 메달의 재료는?', ['골드', 'Gold']),
    ]);
    expect(r.candidatePairs).toBe(1);
  });

  it('다른 대분류 + 같은 정답 + 다른 문장은 문제없음 (건우 원칙)', () => {
    const r = findDuplicates([
      item('a', 'kr-history', 'korea', '훈민정음을 만든 왕은?', ['세종대왕']),
      item('b', 'kr-language', 'korea', '한글 자모의 이름을 정리한 책은?', ['훈몽자회']),
    ]);
    expect(r.candidatePairs).toBe(0);
  });

  it('★ 후보 추리기가 전수 비교보다 훨씬 적다', () => {
    const items: DupeInput[] = [];
    for (let i = 0; i < 50; i += 1) {
      items.push(item(`r${i}`, 'math', 'science', `문제 ${i}`, [`정답${i}`]));
    }
    const r = findDuplicates(items);
    expect(r.totalPairsIfBruteForce).toBe(1225);
    expect(r.candidatePairs).toBe(0);
  });

  it('빈 정답은 후보에 넣지 않는다', () => {
    const r = findDuplicates([
      item('a', 'math', 'science', '질문 1', ['', '  ']),
      item('b', 'math', 'science', '질문 2', ['']),
    ]);
    expect(r.candidatePairs).toBe(0);
  });
});

describe('★ 표기 변형 형식 정리 (R011 실측)', () => {
  it('마침표로 끝나는 변형만 떼어낸다 — 문제는 살린다 (실측: 애플)', () => {
    const r = sanitizeVariants('애플', ['애플', 'Apple', 'Apple Inc.', '애플사']);
    expect(r.kept).toEqual(['애플', 'Apple', '애플사']);
    expect(r.dropped).toEqual(['Apple Inc.']);
  });

  it('단어가 다섯 개 이상인 변형을 떼어낸다 (실측: 오페라의 유령)', () => {
    const r = sanitizeVariants('오페라의 유령', [
      '오페라의 유령',
      'The Phantom of the Opera',
    ]);
    expect(r.kept).toEqual(['오페라의 유령']);
    expect(r.dropped).toEqual(['The Phantom of the Opera']);
  });

  it('★ displayAnswer 는 형식에 안 맞아도 떼어내지 않는다 — 규칙 검사가 잡아야 한다', () => {
    const r = sanitizeVariants('아주 긴 서술형 정답 문장이다.', ['아주 긴 서술형 정답 문장이다.']);
    expect(r.kept).toEqual(['아주 긴 서술형 정답 문장이다.']);
    expect(r.dropped).toEqual([]);
  });

  it('정상 변형은 전부 남긴다', () => {
    const r = sanitizeVariants('세종대왕', ['세종대왕', '세종', '이도']);
    expect(r.dropped).toEqual([]);
  });
});

describe('생성 결과 보조 함수', () => {
  it('난이도 1~5 를 DB 값으로 옮긴다', () => {
    expect(difficultyBucket(1)).toBe('easy');
    expect(difficultyBucket(2)).toBe('easy');
    expect(difficultyBucket(3)).toBe('medium');
    expect(difficultyBucket(4)).toBe('hard');
    expect(difficultyBucket(5)).toBe('hard');
  });

  it('★ sourceRef 는 질문과 정답으로 결정된다 — 같은 문제를 두 번 적재하지 않는다', () => {
    const a = makeGenRef('한글을 창제한 왕은?', '세종대왕');
    const b = makeGenRef('한글을 창제한  왕은?', '세종대왕');
    expect(a).toBe(b); // 띄어쓰기 차이는 같은 문제다
    expect(a).toHaveLength(16);
    expect(makeGenRef('다른 질문은?', '세종대왕')).not.toBe(a);
  });
});
