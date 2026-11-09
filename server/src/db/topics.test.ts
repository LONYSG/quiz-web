// ★ R088 (D-345) — 겹치는 이름(서구 · 고성군) 안내 · 라이어/캐치 풀(머리 플래그 · open 만)
import { describe, expect, it } from 'vitest';
import { ambiguousHint, drawTopics, liarTopics, makeTopicSet } from './topics.js';

describe('겹치는 이름 — 앞 동네를 붙여 주세요', () => {
  const set = makeTopicSet({ topic: 'kr', nameKo: '시군구', kind: 'closed' }, [
    { id: 'a', name: '부산 서구' },
    { id: 'b', name: '대구 서구' },
    { id: 'c', name: '서울 강서구' },
    { id: 'd', name: '부산 강서구' },
    { id: 'e', name: '강원 고성군' },
    { id: 'f', name: '경남 고성군' },
    { id: 'g', name: '달서구', variants: ['달서'] },
    { id: 'h', name: '대전 유성구' },
  ]);
  it('꼬리 이름이 둘 이상에 걸리면 안내(구/군 뗀 꼴도) · 하나뿐이거나 그 자체가 항목이면 아님', () => {
    expect(ambiguousHint(set.ambiguous, '서구')).toMatch(/어느 서구/);
    expect(ambiguousHint(set.ambiguous, '강서구')).toMatch(/어느 강서구/);
    expect(ambiguousHint(set.ambiguous, '고성')).toMatch(/어느 고성/);
    expect(ambiguousHint(set.ambiguous, '유성구')).toBeNull();
    expect(ambiguousHint(set.ambiguous, '달서구')).toBeNull();
    expect(ambiguousHint(set.ambiguous, '부산 서구')).toBeNull();
  });
});

describe('제시어 풀 — 머리 플래그 · open 만', () => {
  const store = {
    loadedAt: 0,
    sets: [
      makeTopicSet({ topic: 'liar-food', nameKo: '음식', kind: 'open', liar: true, draw: false }, [{ id: 'x', name: '라면', liar: true }]),
      makeTopicSet({ topic: 'country', nameKo: '나라', kind: 'closed', liar: false, draw: false }, [{ id: 'y', name: '한국', liar: true, draw: true }]),
      makeTopicSet({ topic: 'draw-animal', nameKo: '동물', kind: 'open', liar: false, draw: true }, [{ id: 'z', name: '고래', draw: true }]),
    ],
  };
  it('closed 세트는 항목 플래그가 있어도 안 쓴다', () => {
    expect(liarTopics(store).map((s) => s.topic)).toEqual(['liar-food']);
    expect(drawTopics(store).map((s) => s.topic)).toEqual(['draw-animal']);
  });
});
