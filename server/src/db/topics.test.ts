// ★ R088 (D-345) — 겹치는 이름(서구 · 고성군) 안내 · 라이어/캐치 풀(머리 플래그 · open 만)
import { describe, expect, it } from 'vitest';
import { ambiguousHint, drawTopics, liarTopics, makeTopicSet, restrictTopics } from './topics.js';

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
    expect(ambiguousHint(set.ambiguous, '서구')).toMatch(/'서구' — 같은 이름이 여러 곳이에요/);
    // ★ R090 — 예시 지명(정답 스포) 없음
    expect(ambiguousHint(set.ambiguous, '서구')).not.toMatch(/예:|부산|대구|인천|광주|대전/);
    expect(ambiguousHint(set.ambiguous, '강서구')).toMatch(/'강서구' — /);
    expect(ambiguousHint(set.ambiguous, '고성')).toMatch(/'고성' — /);
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

describe('★ R090 방장 주제 고르기 — restrictTopics', () => {
  const mk = (topic: string, h: { liar?: boolean; draw?: boolean; optIn?: boolean; kind?: 'open' | 'closed' }) =>
    makeTopicSet({ topic, nameKo: topic, kind: h.kind ?? 'open', liar: h.liar ?? false, draw: h.draw ?? false, optIn: h.optIn }, [{ id: `${topic}-1`, name: `${topic}가`, liar: h.liar, draw: h.draw }]);
  const store = { sets: [mk('l1', { liar: true }), mk('l2', { liar: true, optIn: true }), mk('d1', { draw: true }), mk('d2', { draw: true }), mk('c', { kind: 'closed' })], loadedAt: 0 };
  it('null = optIn 아닌 것 전부 · 고른 것만 · 다른 게임 세트 · closed 는 그대로 · 없는 slug 무시', () => {
    expect(liarTopics(restrictTopics(store, 'liar', null)).map((s) => s.topic)).toEqual(['l1']);
    expect(liarTopics(restrictTopics(store, 'liar', ['l2', 'nope'])).map((s) => s.topic)).toEqual(['l2']);
    expect(restrictTopics(store, 'liar', ['l2']).sets.map((s) => s.topic)).toEqual(['l2', 'd1', 'd2', 'c']);
    expect(drawTopics(restrictTopics(store, 'draw', ['d2'])).map((s) => s.topic)).toEqual(['d2']);
    expect(drawTopics(restrictTopics(store, 'draw', [])).length).toBe(0);
  });
});
