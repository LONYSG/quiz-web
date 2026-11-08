// R081 — 순서대로 · 빙고 (순수 부분) + 세트 거름 · usedTopics 공유
import { describe, expect, it } from 'vitest';
import { bingoLineCount, bingoLines, orderPairs } from '@quiz/shared';
import { bingoTopics, makeTopicSet, orderTopics } from '../db/topics.js';
import { bingo, bingoCallRound, bingoValue, order, pickOrderCards, type BingoState } from './topicGames2.js';
import { topicsFor } from './topicGames.js';
import type { ParsedInput } from './defs.js';

const set = (topic: string, n: number, years: (i: number) => number | null) =>
  makeTopicSet({ topic, nameKo: topic, kind: 'closed' }, Array.from({ length: n }, (_, i) => ({ id: `${topic}-${i}`, name: `${topic}항목${i}`, year: years(i) })));

describe('세트 거름', () => {
  const store = { sets: [set('yr', 10, (i) => 1900 + i), set('few', 30, (i) => (i < 7 ? 1900 + i : null)), set('element', 50, (i) => 1700 + i), set('big', 45, () => null)], loadedAt: 0 };
  it('순서대로 = 서로 다른 연도 6 이상(R082) · element 제외', () => expect(orderTopics(store).map((s) => s.topic)).toEqual(['yr', 'few']));
  it('빙고 = 40 이상', () => expect(bingoTopics(store).map((s) => s.topic)).toEqual(['element', 'big']));
  it('usedTopics 는 게임끼리 같이 쓴다', () => {
    const used = new Set(['element']);
    const q = { data: {} as never, experienced: new Map(), topics: store, usedTopics: used };
    expect(topicsFor(1, 1, { practice: false, participants: ['a'], quiz: q, now: 0 }, 'bingo')!.map((s) => s.topic)).toEqual(['big']);
    expect(used.has('big')).toBe(true);
    expect(topicsFor(1, 1, { practice: false, participants: ['a'], quiz: q, now: 0 }, 'bingo')).toBeNull();
  });
});

describe('순서대로', () => {
  it('쌍 점수 — 정답 10 · 뒤집음 0 · 하나 바꿈 9', () => {
    const y = (id: string) => Number(id);
    expect(orderPairs(['1', '2', '3', '4', '5'], y)).toBe(10);
    expect(orderPairs(['5', '4', '3', '2', '1'], y)).toBe(0);
    expect(orderPairs(['2', '1', '3', '4', '5'], y)).toBe(9);
  });
  it('카드 5 — 연도 서로 다름 · 모자라면 null', () => {
    const c = pickOrderCards(set('t', 12, (i) => 1950 + (i % 6)), 5, () => 0.3)!;
    expect(new Set(c.map((x) => x.year)).size).toBe(5);
    expect(pickOrderCards(set('t', 12, (i) => 1950 + (i % 4)), 5, () => 0.3)).toBeNull();
  });
  it('판 · 입력 — 5장 다 눌러야 값 · 잘못된 id 거름', () => {
    const rs = order.buildRounds(3, { practice: true, participants: ['a'], quiz: null, now: 0 })!;
    expect(rs).toHaveLength(3);
    const s = rs[0]!;
    const ans = (s.reveal!.answer as { id: string }[]).map((x) => x.id);
    expect((s.params.cards as unknown[]).length).toBe(5);
    expect(order.parseInput({ order: ans }, s, { serverElapsedMs: 1 })!.value).toBe(10);
    expect(order.parseInput({ order: [...ans].reverse() }, s, { serverElapsedMs: 1 })!.value).toBe(0);
    expect(order.parseInput({ order: ans.slice(0, 3) }, s, { serverElapsedMs: 1 })!.value).toBeNull();
    expect(order.parseInput({ order: ['x'] }, s, { serverElapsedMs: 1 })).toBeNull();
    expect(order.parseInput({ order: [ans[0], ans[0]] }, s, { serverElapsedMs: 1 })).toBeNull();
  });
});

describe('빙고', () => {
  it('줄 10 · 2줄 셈', () => {
    expect(bingoLines(4)).toHaveLength(10);
    const m = Array.from({ length: 16 }, (_, i) => i < 8);
    expect(bingoLineCount(m)).toBe(2);
  });
  const big = set('bg', 50, () => null);
  const mk = (): { rs: ReturnType<typeof bingo.buildRounds>; st: BingoState } => {
    const rs = bingo.buildRounds(11, { practice: false, participants: ['a', 'b', 'c'], quiz: { data: {} as never, experienced: new Map(), topics: { sets: [big], loadedAt: 0 } }, now: 0 })!;
    return { rs, st: (rs![0]!.secret as { state: BingoState }).state };
  };
  it('채우기 — 맞으면 다음 칸 · 이미 있음 · 틀림 · 끝에 빈 칸 자동', () => {
    const { rs, st } = mk();
    const s0 = rs![0]!;
    expect(rs).toHaveLength(13);
    const subs = new Map<string, ParsedInput & { provisional: boolean }>();
    const f = (t: string) => {
      const r = bingo.parseInput({ text: t }, s0, { serverElapsedMs: 1, accountId: 'a', prev: subs.get('a') })!;
      subs.set('a', r);
      return r.feedback!.result;
    };
    expect([f('bg항목0'), f('bg항목0'), f('없는말'), f('bg항목1')]).toEqual(['ok', 'dup', 'wrong', 'ok']);
    bingo.finalizeRound!(s0, subs);
    for (const p of ['a', 'b', 'c']) {
      const b = st.boards.get(p)!;
      expect(b.every((x) => x !== null)).toBe(true);
      expect(new Set(b).size).toBe(16);
    }
    expect(st.boards.get('a')!.slice(0, 2)).toEqual(['bg-0', 'bg-1']);
    expect(st.manual.get('a')).toBe(2);
  });
  it('같은 판 셋 = 빨리 공동 빙고 · 다른 판 = 12회 끝 · 안 부르면 자동', () => {
    const { st } = mk();
    const same = Array.from({ length: 16 }, (_, i) => `bg-${i}`);
    for (const p of ['a', 'b', 'c']) st.boards.set(p, [...same]);
    // 첫 줄(0~3) · 둘째 줄(4~7)을 차례로 부르면 2판째(셋이 동시에 셋씩 → 6칸) 안에는 아직 · 3판째에 2줄
    let r = 0;
    const order = ['bg-0', 'bg-1', 'bg-2', 'bg-3', 'bg-4', 'bg-5', 'bg-6', 'bg-7'];
    while (!st.over && r < 12) {
      r += 1;
      const picks = new Map(['a', 'b', 'c'].map((p, i) => [p, order[(r - 1) * 3 + i] ?? null]));
      bingoCallRound(st, r, picks);
    }
    expect(st.bingoAt.size).toBe(3);
    expect(new Set([...st.bingoAt.values()]).size).toBe(1);
    expect(st.over).toBe(true);
    expect(bingoValue(st, 'a')).toBe(bingoValue(st, 'b'));
  });
  it('끝 = 12회 · 자동 호명(아무도 안 누름)', () => {
    const { st } = mk();
    for (const [i, p] of ['a', 'b', 'c'].entries()) st.boards.set(p, Array.from({ length: 16 }, (_, k) => `bg-${i * 16 + k}`));
    for (let r = 1; r <= 12 && !st.over; r += 1) bingoCallRound(st, r, new Map());
    expect(st.calls.every((c) => c.auto)).toBe(true);
    expect(st.calls.length).toBeGreaterThan(0);
    expect(st.over).toBe(true);
  });
});
