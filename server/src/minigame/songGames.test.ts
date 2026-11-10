// R084 — 노래 맞히기 · 이 노래 몇 년도? (순수 부분)
import { describe, expect, it } from 'vitest';
import { SONG_FIRST_POINT, matchSong, songFailSkip, songMatcher, songWinner } from '@quiz/shared';
import type { QuizData, QuizItem } from '../db/minigameItems.js';
import type { BuildCtx, ParsedInput, RoundSpec } from './defs.js';
import { pickSongs, song, songPool, songyear } from './songGames.js';

type Subs = Map<string, ParsedInput & { provisional: boolean }>;
const core = { title: '좋은 날', titleVariants: ['Good Day'], artist: '아이유', artistVariants: ['IU'], itunes: { trackName: 'Good Day (Live)', artistName: 'IU' } };

describe('노래 판정 · 점수', () => {
  const m = songMatcher(core);
  it('제목 · 가수 · 영문 · 띄어쓰기 · 괄호', () => {
    expect(matchSong(m, '좋은날')).toBe('title');
    expect(matchSong(m, 'good day')).toBe('title');
    expect(matchSong(m, 'Good Day (Live)')).toBe('title');
    expect(matchSong(m, '아이유')).toBe('artist');
    expect(matchSong(m, 'iu')).toBe('artist');
    expect(matchSong(m, '나쁜 날')).toBeNull();
  });
  it('★ R092 — 이긴 사람 = 서버 도착이 제일 이른 한 명 · 같으면 먼저 넣은 쪽 · 없으면 null · 점수 1', () => {
    expect(songWinner(new Map([['a', 3000], ['b', 1000], ['c', 5000]]))).toBe('b');
    expect(songWinner(new Map([['a', 1000], ['b', 1000]]))).toBe('a');
    expect(songWinner(new Map())).toBeNull();
    expect(SONG_FIRST_POINT).toBe(1);
  });
  it('실패 과반', () => {
    expect(songFailSkip(2, 3)).toBe(true);
    expect(songFailSkip(1, 2)).toBe(false);
    expect(songFailSkip(0, 0)).toBe(false);
  });
});

const item = (n: number, pool: string, extra: Record<string, unknown> = {}): QuizItem => ({
  id: `song-${String(n).padStart(4, '0')}`,
  game: 'song',
  payload: { title: `노래${n}`, titleVariants: [], artist: `가수${n}`, artistVariants: [], year: 2000 + n, pool, itunes: { trackId: n, previewUrl: `https://audio.example/${n}.m4a`, artworkUrl100: `https://img.example/${n}.jpg` }, ...extra },
  imageIds: [],
  attribution: null,
  asOf: null,
});
const data = (items: QuizItem[]) => ({ items: { song: items }, products: new Map(), imageDims: new Map(), loadedAt: 0 }) as unknown as QuizData;
const ctxOf = (items: QuizItem[], exp = new Map<string, Set<string>>(), used = new Set<string>()): BuildCtx => ({ practice: false, participants: ['a', 'b'], quiz: { data: data(items), experienced: exp, used }, now: Date.parse('2026-11-08') });

describe('곡 고르기', () => {
  it('미리듣기 없는 · 연습 곡은 뺀다', () => {
    const its = [item(1, 'pop'), item(2, 'pop', { itunes: { trackId: 2, previewUrl: '' } }), item(3, 'pop', { itunes: { trackId: 984607460, previewUrl: 'https://x/a.m4a' } })];
    expect(songPool(its).map((x) => x.id)).toEqual(['song-0001']);
  });
  it('3곡 · 한 pool 만 되지 않게 · 같은 판에서 다른 게임이 쓴 곡 피함 · 들은 곡(두 게임)', () => {
    const its = [...Array.from({ length: 8 }, (_, i) => item(i + 1, 'kpop-year')), item(20, 'pop')];
    for (let s = 1; s < 30; s += 1) {
      const p = pickSongs('song', s, ctxOf(its))!;
      expect(p.items).toHaveLength(3);
      expect(new Set(p.items.map((x) => (x.payload as { pool: string }).pool)).size).toBeGreaterThan(1);
    }
    const used = new Set<string>();
    const ctx = ctxOf(its, new Map(), used);
    const a = pickSongs('song', 5, ctx)!;
    const b = pickSongs('songyear', 6, ctx)!;
    expect(a.items.some((x) => b.items.includes(x))).toBe(false);
    // 둘 다 songyear 로 들은 곡은 뒤로(모두 들음 = 제외)
    const heard = new Map([['a', new Set(['songyear|song-0001', 'song|song-0002'])], ['b', new Set(['songyear|song-0001', 'songyear|song-0002'])]]);
    for (let s = 1; s < 10; s += 1) expect(pickSongs('song', s, ctxOf(its, heard))!.items.map((x) => x.id)).not.toContain('song-0001');
    expect(pickSongs('song', 1, ctxOf(its.slice(0, 2)))).toBeNull();
  });
});

const spec = (key: 'song' | 'songyear'): RoundSpec => song.buildRounds.call(null, 1, { practice: true, participants: ['a', 'b', 'c'], quiz: null, now: Date.parse('2026-11-08') })!.map((r) => (key === 'songyear' ? { ...r, params: { ...r.params, min: 1950, max: 2026 } } : r))[1]!;
const feed = (def: typeof song, sp: RoundSpec, subs: Subs, acct: string, input: Record<string, unknown>, ms: number) => {
  const r = def.parseInput(input, sp, { serverElapsedMs: ms, prev: subs.get(acct), accountId: acct });
  if (r) subs.set(acct, r);
  return r;
};

describe('노래 맞히기 판', () => {
  it('★ R092 — 가수 → artist 알림 · 점수 0 · 곡 안 끝남 / 오답 / 첫 제목 → +1 · 곡 끝 / 그 뒤 입력 무시', () => {
    const sp = spec('song'); // 쏘리 쏘리 / 슈퍼주니어
    const subs: Subs = new Map();
    expect(feed(song, sp, subs, 'b', { text: 'super junior', elapsedMs: 1000 }, 1500)!.feedback).toMatchObject({ result: 'artist', part: 'artist' });
    expect(subs.get('b')).toMatchObject({ value: null, submitted: false });
    expect(feed(song, sp, subs, 'c', { text: '빅뱅', elapsedMs: 1500 }, 2000)!.feedback).toMatchObject({ result: 'wrong' });
    expect(song.earlyEnd!(sp, subs, ['a', 'b', 'c'])).toBe(false);
    expect(feed(song, sp, subs, 'a', { text: '쏘리쏘리', elapsedMs: 2000 }, 2500)!.feedback).toMatchObject({ result: 'ok', part: 'title' });
    expect(song.earlyEnd!(sp, subs, ['a', 'b', 'c'])).toBe(true); // 맞히는 순간 곡 끝
    expect(feed(song, sp, subs, 'a', { text: 'sorry sorry', elapsedMs: 2600 }, 3000)).toBeNull(); // 이미 맞힘
    expect(subs.get('b')!.extra).toMatchObject({ tries: 1 });
    const fin = song.finalizeRound!(sp, subs);
    expect([fin.values.get('a')!.value, fin.values.get('b')!.value, fin.values.get('c')!.value]).toEqual([1, null, null]);
    expect(fin.values.get('a')!.extra).toMatchObject({ won: true, points: 1 });
    expect(fin.reveal).toMatchObject({ title: '쏘리 쏘리', artist: '슈퍼주니어', year: 2009, winner: 'a', winnerMs: 2000 });
  });
  it('★ R092 — 같은 곡에 제목 둘(엔진 밖 안전망) → 서버 도착이 이른 한 명만 +1', () => {
    const sp = spec('song');
    const subs: Subs = new Map();
    feed(song, sp, subs, 'b', { text: '쏘리 쏘리', elapsedMs: 900 }, 3000); // 기기 시간은 빨라도 도착이 늦음
    feed(song, sp, subs, 'a', { text: '쏘리 쏘리', elapsedMs: 2000 }, 2500);
    const fin = song.finalizeRound!(sp, subs);
    expect([fin.values.get('a')!.value, fin.values.get('b')!.value]).toEqual([1, null]);
  });
  it('★ R092 — 아무도 못 맞힘(가수 · 오답만) → 끝까지 · 전원 0 · winner null', () => {
    const sp = spec('song');
    const subs: Subs = new Map();
    feed(song, sp, subs, 'a', { text: '슈주', elapsedMs: 1000 }, 1000);
    feed(song, sp, subs, 'b', { text: '아니야', elapsedMs: 1000 }, 1000);
    expect(song.earlyEnd!(sp, subs, ['a', 'b'])).toBe(false);
    const fin = song.finalizeRound!(sp, subs);
    expect([...fin.values.values()].every((v) => v.value === null)).toBe(true);
    expect(fin.reveal).toMatchObject({ winner: null, winnerMs: null });
  });
  it('재생 실패 과반 → 건너뜀(전원 0 · reveal.skipped) · 한 번만 보고', () => {
    const sp = spec('song');
    const subs: Subs = new Map();
    feed(song, sp, subs, 'a', { text: '슈퍼주니어', elapsedMs: 1000 }, 1500);
    expect(feed(song, sp, subs, 'b', { fail: true }, 2000)).not.toBeNull();
    expect(feed(song, sp, subs, 'b', { fail: true }, 2100)).toBeNull();
    expect(song.earlyEnd!(sp, subs, ['a', 'b', 'c'])).toBe(false);
    feed(song, sp, subs, 'c', { fail: true }, 2200);
    expect(song.earlyEnd!(sp, subs, ['a', 'b', 'c'])).toBe(true);
    const fin = song.finalizeRound!(sp, subs);
    expect([...fin.values.values()].every((v) => v.value === null)).toBe(true);
    expect(fin.reveal).toMatchObject({ skipped: true, fails: 2 });
  });
});

describe('이 노래 몇 년도? 판', () => {
  it('연도 바꾸기(마지막) · 범위 밖 거절 · 오차 · 실패 보고 뒤에도 답 유지', () => {
    const sp = spec('songyear'); // 2009
    const subs: Subs = new Map();
    expect(feed(songyear, sp, subs, 'a', { value: 1949, elapsedMs: 1000 }, 1000)).toBeNull();
    feed(songyear, sp, subs, 'a', { value: 2005, elapsedMs: 1000 }, 1000);
    feed(songyear, sp, subs, 'a', { value: 2010, elapsedMs: 3000 }, 3000);
    feed(songyear, sp, subs, 'b', { value: 1999, elapsedMs: 3000 }, 3000);
    feed(songyear, sp, subs, 'b', { fail: true }, 3500);
    expect(subs.get('a')!.value).toBe(1);
    expect(subs.get('b')!.value).toBe(10);
    const fin = songyear.finalizeRound!(sp, subs);
    expect(fin.values.get('a')!.value).toBe(1);
    expect(fin.values.get('b')!.value).toBe(10);
  });
});
