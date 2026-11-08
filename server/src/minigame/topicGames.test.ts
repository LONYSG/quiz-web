// R080 — 많이 말하기 · 겹치면 무효 · 객관식 10연속 (순수 부분)
import { describe, expect, it } from 'vitest';
import { buildTopicMatcher, manyReveal, matchTopic, uniqueResult } from '@quiz/shared';
import { makeTopicSet } from '../db/topics.js';
import { choice, choiceDistractors, many, pickChoiceQuestions, pickTopicSets, unique, type ChoiceQ } from './topicGames.js';
import type { ParsedInput, RoundSpec } from './defs.js';

const items = [
  { id: 'c-001', name: '대한민국', variants: ['한국', '남한', 'South Korea'] },
  { id: 'c-002', name: '미국', variants: ['미합중국', 'USA'] },
  { id: 'c-003', name: '콩고 민주 공화국', variants: ['콩고민주공화국'] },
  { id: 'c-004', name: '달러(미국 · 캐나다)', label: '달러', variants: ['미국 달러'] },
];

describe('주제 판정(퀴즈와 같은 정규화)', () => {
  const m = buildTopicMatcher(items);
  it('name · 변형 · 공백 · 대소문자 · 괄호 · 끝맺음', () => {
    expect(matchTopic(m, '대한민국')).toBe('c-001');
    expect(matchTopic(m, ' 한 국 ')).toBe('c-001');
    expect(matchTopic(m, 'south korea')).toBe('c-001');
    expect(matchTopic(m, '콩고민주공화국')).toBe('c-003');
    expect(matchTopic(m, '달러')).toBe('c-004');
    expect(matchTopic(m, '미국입니다')).toBe('c-002');
    expect(matchTopic(m, '일본')).toBeNull();
    expect(matchTopic(m, '')).toBeNull();
  });
  it('겹치면 무효 정산 — 혼자 1 · 겹침 0 · 오답 0', () => {
    const r = uniqueResult(new Map([['a', 'c-001'], ['b', 'c-001'], ['c', 'c-002'], ['d', null]]));
    expect(r.get('a')).toEqual({ itemId: 'c-001', dup: true, win: false });
    expect(r.get('c')!.win).toBe(true);
    expect(r.get('d')!.win).toBe(false);
  });
  it('많이 말하기 공개 — 나만 말한 답 · 못 말한 것', () => {
    const r = manyReveal(new Map([['a', ['c-001', 'c-002']], ['b', ['c-002']]]), ['c-001', 'c-002', 'c-003', 'c-004']);
    expect(r.only.get('a')).toEqual(['c-001']);
    expect(r.only.get('b')).toEqual([]);
    expect(r.missed).toEqual(['c-003', 'c-004']);
  });
});

const sets = ['a', 'b', 'c', 'd'].map((t) => makeTopicSet({ topic: t, nameKo: t, kind: 'closed' }, items.map((x) => ({ ...x, id: `${t}-${x.id}` }))));

describe('주제 고르기', () => {
  it('쓴 주제 제외 · 본 사람 적은 순 · 모자라면 null', () => {
    const exp = new Map([['p1', new Set(['many|topic:a', 'unique|topic:b'])], ['p2', new Set(['many|topic:a'])]]);
    const pick = pickTopicSets(sets, 2, 7, ['p1', 'p2'], exp, new Set(['c']));
    expect(pick!.map((s) => s.topic)).toEqual(['d', 'b']);
    expect(pickTopicSets(sets, 3, 7, ['p1'], exp, new Set(['a', 'b']))).toBeNull();
  });
});

const run = (def: typeof many, spec: RoundSpec, acct: string, texts: string[], subs: Map<string, ParsedInput & { provisional: boolean }>) => {
  const fbs: Record<string, unknown>[] = [];
  for (const t of texts) {
    const r = def.parseInput({ text: t }, spec, { serverElapsedMs: 1000, prev: subs.get(acct), accountId: acct });
    if (r) {
      subs.set(acct, r);
      if (r.feedback) fbs.push(r.feedback);
    }
  }
  return fbs;
};

describe('많이 말하기 · 겹치면 무효 판', () => {
  it('많이 말하기 — ✓ / 이미 말함 / ✗ · 값 = 맞힌 수 · 정산', () => {
    // 항목 20 미만 세트는 못 쓴다 → sets(4 항목)는 걸러져 null
    expect(many.buildRounds(1, { practice: false, participants: ['a', 'b'], quiz: { data: {} as never, experienced: new Map(), topics: { sets, loadedAt: 0 } }, now: 0 })).toBeNull();
    const big = makeTopicSet({ topic: 'big', nameKo: '나라', kind: 'closed', timeSec: 30 }, [...items, ...Array.from({ length: 20 }, (_, i) => ({ id: `x-${i}`, name: `가상국${i}` }))]);
    const rs = many.buildRounds(1, { practice: false, participants: ['a', 'b'], quiz: { data: {} as never, experienced: new Map(), topics: { sets: [big], loadedAt: 0 } }, now: 0 })!;
    expect(rs[0]!.playMs).toBe(30_000);
    expect(rs[0]!.itemKey).toBe('topic:big');
    const subs = new Map<string, ParsedInput & { provisional: boolean }>();
    const fa = run(many, rs[0]!, 'a', ['한국', '대한민국', '일본', '미국'], subs);
    expect(fa.map((f) => f.result)).toEqual(['ok', 'dup', 'wrong', 'ok']);
    run(many, rs[0]!, 'b', ['미국'], subs);
    expect(subs.get('a')!.value).toBe(2);
    const fin = many.finalizeRound!(rs[0]!, subs);
    expect(fin.values.get('a')!.extra!.only).toEqual(['c-001']);
    expect((fin.reveal!.missed as string[]).length).toBe(24 - 2);
    expect((fin.reveal!.labels as Record<string, string>)['c-001']).toBe('대한민국');
  });
  it('겹치면 무효 — 3판 다른 주제 · 마지막 답 · 겹치면 0', () => {
    const rs = unique.buildRounds(5, { practice: true, participants: ['a', 'b'], quiz: null, now: 0 })!;
    expect(new Set(rs.map((r) => r.itemKey)).size).toBe(3);
    const subs = new Map<string, ParsedInput & { provisional: boolean }>();
    run(unique, rs[0]!, 'a', ['빨강', '파란색'], subs);
    run(unique, rs[0]!, 'b', ['파랑'], subs);
    run(unique, rs[0]!, 'c', ['노랑'], subs);
    const fin = unique.finalizeRound!(rs[0]!, subs);
    expect(fin.values.get('a')!.value).toBeNull();
    expect(fin.values.get('b')!.extra!.dup).toBe(true);
    expect(fin.values.get('c')!.value).toBe(1);
  });
});

const q = (id: string, cat: string, mid: string, ans: string, extra: Partial<ChoiceQ> = {}): ChoiceQ => ({ id, text: `문제 ${id}`, categoryName: cat, categoryMid: mid, displayAnswer: ans, answersNorm: [ans.toLowerCase().replace(/\s/g, '')], grade: 2, worth: 2, ...extra });

describe('객관식 10연속', () => {
  const pool: ChoiceQ[] = [];
  for (let i = 0; i < 40; i += 1) pool.push(q(String(i + 1), ['역사', '과학', '지리'][i % 3]!, `m${i % 6}`, `정답${i}`));
  it('보기 — 같은 중분류 먼저 · 정답과 겹치는 것 제외 · 셋', () => {
    const d = choiceDistractors(pool[0]!, pool, () => 0.5)!;
    expect(d).toHaveLength(3);
    expect(d).not.toContain('정답0');
    const mids = d.map((x) => pool.find((p) => p.displayAnswer === x)!.categoryMid);
    expect(mids.every((m) => m === 'm0')).toBe(true);
  });
  it('10문항 — 알가치 · 등급 · 쓴 문항 · 쓴 정답 제외 · 정답 보기 안에', () => {
    const p2 = [...pool, q('900', '역사', 'm0', '안나옴', { worth: 1 }), q('901', '역사', 'm0', '어려움', { grade: 5 })];
    const r = pickChoiceQuestions(p2, { usedIds: new Set(['1']), usedNorms: new Set(['정답2']), seed: 3 })!;
    expect(r).toHaveLength(10);
    const ids = r.map((x) => x.q.id);
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('3');
    expect(ids).not.toContain('900');
    expect(ids).not.toContain('901');
    for (const x of r) expect(x.options[x.answer]).toBe(x.q.displayAnswer);
    expect(pickChoiceQuestions(pool.slice(0, 5), { usedIds: new Set(), usedNorms: new Set(), seed: 1 })).toBeNull();
  });
  it('판 만들기 — 고른 문항을 game 의 쓴 문항 · 쓴 정답에 넣는다 · 입력 판정', () => {
    const game = { pool: pool as never, usedQuestionIds: new Set<string>(), usedAnswerNorms: new Set<string>() };
    const rs = choice.buildRounds(9, { practice: false, participants: ['a'], quiz: null, game, now: 0 })!;
    expect(rs).toHaveLength(10);
    expect(game.usedQuestionIds.size).toBe(10);
    const s = rs[0]!;
    const ans = Number(s.secret!.answer);
    expect(choice.parseInput({ choice: ans, elapsedMs: 1200 }, s, { serverElapsedMs: 1500 })!.value).toBe(1200);
    expect(choice.parseInput({ choice: (ans + 1) % 4, elapsedMs: 1200 }, s, { serverElapsedMs: 1500 })!.value).toBeNull();
    expect(choice.parseInput({ choice: 4 }, s, { serverElapsedMs: 1500 })).toBeNull();
    expect(choice.noItemExperience).toBe(true);
  });
});
