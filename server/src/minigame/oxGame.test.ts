// R085 — OX 10연속 (순수 부분): 고르기(앞 5 grade 1 · 쌍 금지 · 대분류 ≤ 3 · 본 것 뒤로 · 모자람) · 입력(바꾸기 · 정답 값)
import { describe, expect, it } from 'vitest';
import { pickOxItems } from '@quiz/shared';
import type { QuizData, QuizItem } from '../db/minigameItems.js';
import type { BuildCtx, ParsedInput } from './defs.js';
import { ox, pickOx } from './oxGame.js';

const L1 = ['한국', '생활', '인문', '문화', '자연', '기술', '스포츠'];
const lite = (n: number, grade: number, l1: string, pairId: string | null = null) => ({ id: `ox-${String(n).padStart(4, '0')}`, grade, l1, pairId });
const pool = [
  ...Array.from({ length: 14 }, (_, i) => lite(i + 1, 1, L1[i % 7]!, i < 4 ? `p${i % 2}` : null)),
  ...Array.from({ length: 14 }, (_, i) => lite(i + 101, 2 + (i % 2), L1[i % 7]!)),
];

describe('OX 고르기', () => {
  it('10 · 앞 5 grade 1 · 뒤 5 grade 2·3 · 같은 pairId 없음 · 대분류 ≤ 3', () => {
    for (let s = 1; s < 40; s += 1) {
      const p = pickOxItems(pool, ['a'], () => false, s)!;
      expect(p.items).toHaveLength(10);
      expect(p.items.slice(0, 5).every((x) => x.grade === 1)).toBe(true);
      expect(p.items.slice(5).every((x) => x.grade >= 2)).toBe(true);
      const pairs = p.items.map((x) => x.pairId).filter(Boolean);
      expect(new Set(pairs).size).toBe(pairs.length);
      const per = new Map<string, number>();
      for (const x of p.items) per.set(x.l1, (per.get(x.l1) ?? 0) + 1);
      expect(Math.max(...per.values())).toBeLessThanOrEqual(3);
    }
  });
  it('전원 본 문장은 뒤로 · grade 1 이 모자라면 채움 · 10 미만 null', () => {
    const seenIds = new Set(pool.filter((x) => x.grade === 1).slice(0, 10).map((x) => x.id));
    const p = pickOxItems(pool, ['a', 'b'], (_a, id) => seenIds.has(id), 3)!;
    expect(p.items.slice(0, 4).every((x) => !seenIds.has(x.id))).toBe(true);
    const few = [...pool.filter((x) => x.grade === 1).slice(0, 2), ...pool.filter((x) => x.grade > 1)];
    const q = pickOxItems(few, ['a'], () => false, 5)!;
    expect(q.items.slice(0, 2).every((x) => x.grade === 1)).toBe(true);
    expect(q.items).toHaveLength(10);
    expect(pickOxItems(pool.slice(0, 9), ['a'], () => false, 1)).toBeNull();
  });
});

const item = (x: ReturnType<typeof lite>, answer: boolean): QuizItem => ({
  id: x.id,
  game: 'ox',
  payload: { statement: `문장 ${x.id} 은 사실이다.`, answer, explanation: `해설 ${x.id}`, category: { l1: x.l1, l2: '' }, grade: x.grade, trap: answer ? 'none' : 'name', pairId: x.pairId },
  imageIds: [],
  attribution: null,
  asOf: null,
});
const ctxOf = (used = new Set<string>()): BuildCtx => ({
  practice: false,
  participants: ['a'],
  quiz: { data: { items: { ox: pool.map((x, i) => item(x, i % 2 === 0)) }, products: new Map(), imageDims: new Map(), loadedAt: 0 } as unknown as QuizData, experienced: new Map(), used },
  now: 0,
});

describe('OX 판', () => {
  it('판 10 · params 에 정답 없음 · 같은 게임 두 번째 판은 앞 문장 피함', () => {
    const used = new Set<string>();
    const r1 = ox.buildRounds(1, ctxOf(used))!;
    expect(r1).toHaveLength(10);
    expect(r1.every((r) => !('answer' in r.params) && typeof r.params.statement === 'string' && typeof r.reveal?.answer === 'boolean')).toBe(true);
    const r2 = pickOx(2, ctxOf(used))!;
    const ids1 = new Set(r1.map((r) => r.itemId));
    expect(r2.items.filter((it) => ids1.has(it.id)).length).toBeLessThanOrEqual(2);
  });
  it('입력 — O/X 만 · 바꾸기(마지막) · 맞으면 값 = ms · 틀리면 null', () => {
    const sp = ox.buildRounds(1, { practice: true, participants: ['a'], quiz: null, now: 0 })![1]!; // 일주일은 8일 — 거짓
    expect(ox.parseInput({ pick: 'O', elapsedMs: 100 }, sp, { serverElapsedMs: 500 })).toBeNull();
    const a = ox.parseInput({ pick: true, elapsedMs: 800 }, sp, { serverElapsedMs: 1000 })! as ParsedInput & { provisional: boolean };
    expect([a.value, a.extra?.correct, a.provisional]).toEqual([null, false, true]);
    const b = ox.parseInput({ pick: false, elapsedMs: 1500 }, sp, { serverElapsedMs: 1600, prev: a })!;
    expect([b.value, b.extra?.correct, b.extra?.changes]).toEqual([1500, true, 1]);
  });
});
