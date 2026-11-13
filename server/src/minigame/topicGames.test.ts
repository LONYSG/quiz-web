// R080 — 많이 말하기 · 겹치면 무효 · 객관식 10연속 (순수 부분)
import { describe, expect, it } from 'vitest';
import { buildTopicMatcher, manyReveal, matchTopic, uniqueCount } from '@quiz/shared';
import { makeTopicSet } from '../db/topics.js';
import { choice, fakeChoiceOptions, many, pickChoiceQuestions, pickTopicSets, unique, type ChoiceQ } from './topicGames.js';
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
  it('★ R099 겹치면 무효 정산 — 안 겹친 항목 수 · 겹친 항목은 전원 0 · 같은 사람 중복은 하나', () => {
    const r = uniqueCount(new Map([['a', ['c-001', 'c-002', 'c-002']], ['b', ['c-001', 'c-003']], ['c', []]]));
    expect(r.get('a')).toEqual({ only: ['c-002'], dup: ['c-001'] });
    expect(r.get('b')).toEqual({ only: ['c-003'], dup: ['c-001'] });
    expect(r.get('c')).toEqual({ only: [], dup: [] });
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
  it('★ R090 — 같은 group 세트는 한 자리(지하철 13 + 보통 24 → 지하철 1/25 꼴) · 자리 안 균등 · 모자라면 남은 group 으로', () => {
    const mk = (t: string, group?: string) => makeTopicSet({ topic: t, nameKo: t, kind: 'closed', group }, items.map((x) => ({ ...x, id: `${t}-${x.id}` })));
    const pool = [...Array.from({ length: 13 }, (_, i) => mk(`metro-${i}`, 'metro')), ...Array.from({ length: 24 }, (_, i) => mk(`t-${i}`))];
    let metro = 0;
    const inGroup = new Map<string, number>();
    const N = 5000;
    for (let seed = 1; seed <= N; seed += 1) {
      const p = pickTopicSets(pool, 1, seed, ['p1'], new Map(), new Set())!;
      if (p[0]!.group === 'metro') {
        metro += 1;
        inGroup.set(p[0]!.topic, (inGroup.get(p[0]!.topic) ?? 0) + 1);
      }
    }
    expect(metro / N).toBeGreaterThan(1 / 25 - 0.015);
    expect(metro / N).toBeLessThan(1 / 25 + 0.015); // 13/37 = 0.35 가 아니다
    expect(inGroup.size).toBeGreaterThanOrEqual(10); // 자리 안에서 고루
    // 3 개를 뽑으면 지하철은 많아야 하나(자리가 남아 있을 때)
    for (let seed = 1; seed <= 300; seed += 1) expect(pickTopicSets(pool, 3, seed, ['p1'], new Map(), new Set())!.filter((s) => s.group === 'metro').length).toBeLessThanOrEqual(1);
    // 자리가 모자라면 group 세트로 채움
    const small = [mk('m1', 'metro'), mk('m2', 'metro'), mk('x')];
    expect(pickTopicSets(small, 3, 1, ['p1'], new Map(), new Set())!.length).toBe(3);
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
  it('★★★ R099 겹치면 무효 — 3판 다른 주제 · 여러 답 · 겹친 항목만 0 · 점수 = 안 겹친 정답 수 · 기록 input.texts', () => {
    const rs = unique.buildRounds(5, { practice: true, participants: ['a', 'b'], quiz: null, now: 0 })!;
    expect(new Set(rs.map((r) => r.itemKey)).size).toBe(3);
    expect(rs[0]!.playMs).toBe(15_000);
    const subs = new Map<string, ParsedInput & { provisional: boolean }>();
    const fa = run(unique, rs[0]!, 'a', ['빨강', '파란색', '빨간색', '틀린답', '틀린답', '노랑', '초록'], subs);
    expect(fa.map((f) => f.result)).toEqual(['ok', 'ok', 'dup', 'wrong', 'dupWrong', 'ok', 'ok']);
    run(unique, rs[0]!, 'b', ['파랑', '보라'], subs);
    run(unique, rs[0]!, 'c', ['노란색', '아무말'], subs);
    expect(subs.get('a')!.input).toEqual({ texts: ['빨강', '파란색', '틀린답', '노랑', '초록'] });
    expect(subs.get('a')!.value).toBeNull();
    const fin = unique.finalizeRound!(rs[0]!, subs);
    // a: 빨강 · 초록 혼자(2) · 파랑(b) · 노랑(c) 겹침 / b: 보라 혼자(1) / c: 노랑 겹침 → 0
    expect(fin.values.get('a')!.value).toBe(2);
    expect(fin.values.get('b')!.value).toBe(1);
    expect(fin.values.get('c')!.value).toBeNull();
    expect((fin.values.get('a')!.extra!.dup as string[]).length).toBe(2);
    expect((fin.values.get('c')!.extra!.dup as string[]).length).toBe(1);
    expect(Object.keys(fin.reveal!.labels as Record<string, string>).length).toBe(5);
  });
});

const q = (id: string, cat: string, mid: string, ans: string, extra: Partial<ChoiceQ> = {}): ChoiceQ => ({ id, text: `문제 ${id}`, categoryName: cat, categoryMid: mid, displayAnswer: ans, answersNorm: [ans.toLowerCase().replace(/\s/g, '')], grade: 2, worth: 2, ...extra });

describe('객관식 5연속(R090 — 저장 보기만)', () => {
  const pool: ChoiceQ[] = [];
  for (let i = 0; i < 40; i += 1) pool.push(q(String(i + 1), ['역사', '과학', '지리'][i % 3]!, `m${i % 6}`, `정답${i}`));
  const opt = (ids: string[]) => new Map<string, readonly string[]>(ids.map((id) => [id, [`오답${id}a`, `오답${id}b`, `오답${id}c`]]));
  const all = opt(pool.map((x) => x.id));
  it('5문항 — 저장 보기 있는 문항만 · 알가치 · 등급 · 쓴 문항 · 쓴 정답 제외 · 정답 보기 안에 · 보기 = 정답 + 저장 셋', () => {
    const p2 = [...pool, q('900', '역사', 'm0', '안나옴', { worth: 1 }), q('901', '역사', 'm0', '어려움', { grade: 5 })];
    const r = pickChoiceQuestions(p2, { usedIds: new Set(['1']), usedNorms: new Set(['정답2']), seed: 3, options: opt([...pool.map((x) => x.id), '900', '901']) })!;
    expect(r).toHaveLength(5);
    const ids = r.map((x) => x.q.id);
    for (const bad of ['1', '3', '900', '901']) expect(ids).not.toContain(bad);
    for (const x of r) {
      expect(x.options[x.answer]).toBe(x.q.displayAnswer);
      expect(x.options.filter((o) => o !== x.q.displayAnswer).sort()).toEqual([`오답${x.q.id}a`, `오답${x.q.id}b`, `오답${x.q.id}c`]);
    }
    // 저장 보기 없는 문항은 안 나옴 · 4 문항뿐이면 null(그 판 후보에서 빠짐)
    expect(pickChoiceQuestions(pool, { usedIds: new Set(), usedNorms: new Set(), seed: 1, options: opt(['1', '2', '3', '4']) })).toBeNull();
    expect(pickChoiceQuestions(pool, { usedIds: new Set(), usedNorms: new Set(), seed: 1, options: new Map() })).toBeNull();
  });
  it('정답 변형과 겹치는 저장 보기(지운 꼴 포함)면 그 문항은 건너뜀', () => {
    const qs = [q('a1', '역사', 'm', 'Wi-Fi', { answersRaw: ['Wi-Fi', '와이파이'] }), ...pool.slice(0, 8)];
    const o = new Map<string, readonly string[]>([['a1', ['WiFi', '블루투스', 'LTE']], ...opt(pool.slice(0, 8).map((x) => x.id))]);
    for (let seed = 1; seed < 30; seed += 1) expect(pickChoiceQuestions(qs, { usedIds: new Set(), usedNorms: new Set(), seed, options: o })!.map((x) => x.q.id)).not.toContain('a1');
  });
  it('판 만들기 — 고른 문항을 game 의 쓴 문항 · 쓴 정답에 넣는다 · 입력 판정 · 검사 서버 가짜 보기', () => {
    const game = { pool: pool as never, usedQuestionIds: new Set<string>(), usedAnswerNorms: new Set<string>(), choiceOptions: all };
    const rs = choice.buildRounds(9, { practice: false, participants: ['a'], quiz: null, game, now: 0 })!;
    expect(rs).toHaveLength(5);
    expect(game.usedQuestionIds.size).toBe(5);
    const s = rs[0]!;
    const ans = Number(s.secret!.answer);
    expect(choice.parseInput({ choice: ans, elapsedMs: 1200 }, s, { serverElapsedMs: 1500 })!.value).toBe(1200);
    expect(choice.parseInput({ choice: (ans + 1) % 4, elapsedMs: 1200 }, s, { serverElapsedMs: 1500 })!.value).toBeNull();
    expect(choice.parseInput({ choice: 4 }, s, { serverElapsedMs: 1500 })).toBeNull();
    expect(choice.noItemExperience).toBe(true);
    expect(fakeChoiceOptions(pool, new Map()).size).toBe(40);
    expect(choice.buildRounds(9, { practice: true, participants: ['a'], quiz: null, now: 0 })!.length).toBeLessThanOrEqual(5);
  });
});
