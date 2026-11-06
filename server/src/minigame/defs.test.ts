import { describe, expect, it } from 'vitest';
import { PHOTO_HINT_CHOSUNG_MS, PHOTO_HINT_GENERAL_MS } from '@quiz/shared';
import { MINIGAME_DEFS } from './defs.js';
import type { RoundSpec } from './defs.js';

// ★★ R066 (D-283 · 찬종 #48) — 사진 힌트: 난이도 3 = 6초 분류 · 10초 초성 / 1 · 2 = 10초 초성만
describe('R066 사진 시간 힌트', () => {
  const live = MINIGAME_DEFS.photo.liveParams!;
  const spec = (secret: Record<string, unknown>) => ({ itemKey: 'p', params: {}, playMs: 20_000, seed: 1, secret }) as unknown as RoundSpec;
  it('난이도 3 — 6초 분류 → 10초 분류 + 초성', () => {
    const s = spec({ answers: ['벼루'], chosung: 'ㅂㄹ', general: '생활용품' });
    expect(live.times(s)).toEqual([PHOTO_HINT_GENERAL_MS, PHOTO_HINT_CHOSUNG_MS]);
    expect(live.at(s, 5_999)).toEqual({});
    expect(live.at(s, 6_000)).toEqual({ generalHint: '생활용품' });
    expect(live.at(s, 10_000)).toEqual({ generalHint: '생활용품', chosung: 'ㅂㄹ' });
  });
  it('난이도 1 · 2 — 10초 초성만', () => {
    const s = spec({ answers: ['벼루'], chosung: 'ㅂㄹ' });
    expect(live.times(s)).toEqual([PHOTO_HINT_CHOSUNG_MS]);
    expect(live.at(s, 9_999)).toEqual({});
    expect(live.at(s, 10_000)).toEqual({ chosung: 'ㅂㄹ' });
  });
});

// ★★★ R077 (D-327 · 찬종 "인원 수보다 소수파 선택지가 적게") — 선택지 = 인원 − 1 (2~5) · 다섯 판 같은 n · 범위 밖 거부
describe('R077 소수파 선택지 = 인원 − 1', () => {
  const def = MINIGAME_DEFS.minority;
  const build = (n: number) => def.buildRounds(1, { practice: false, participants: Array.from({ length: n }, (_, i) => `a${i}`), quiz: null, now: 0 })!;
  it('3명 → 1~2 · 4명 → 1~3 · 5명 → 1~4 · 6 · 10명 → 1~5 · 다섯 판 같은 n', () => {
    expect([3, 4, 5, 6, 10].map((n) => (build(n)[0]!.params.choices as number[]).length)).toEqual([2, 3, 4, 5, 5]);
    expect(build(3).every((r) => (r.params.choices as number[]).join() === '1,2')).toBe(true);
    expect(build(3)).toHaveLength(5);
  });
  it('parseInput 경계 — n=2 에서 3 거부 · 2 받음', () => {
    const r = build(3)[0]!;
    expect(def.parseInput({ pick: 3 }, r, { serverElapsedMs: 0 })).toBeNull();
    expect(def.parseInput({ pick: 0 }, r, { serverElapsedMs: 0 })).toBeNull();
    expect(def.parseInput({ pick: 2 }, r, { serverElapsedMs: 0 })?.extra).toEqual({ pick: 2 });
  });
  it('finalizeRound — n=2 · 3명 1·1·2 → 소수파 [2] · counts 1~2', () => {
    const r = build(3)[0]!;
    const subs = new Map([['a', 1], ['b', 1], ['c', 2]].map(([k, p]) => [k as string, { input: { pick: p }, value: null, error: null, elapsedMs: null, extra: { pick: p }, provisional: true }]));
    const out = def.finalizeRound!(r, subs as never);
    expect(out.reveal).toEqual({ counts: { 1: 2, 2: 1 }, minority: [2] });
    expect(out.values.get('c')?.value).toBe(1);
    expect(out.values.get('a')?.value).toBeNull();
  });
});
