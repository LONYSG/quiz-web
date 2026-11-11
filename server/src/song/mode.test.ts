// R096 — 노래 맞히기 방식(서버 순수 부분): 범위 거르기 · inactive 제외(적재본만 읽음) · 다음 곡(경험 없는 곡 먼저 · 중복 0) ·
//   판정 재료(제목만 · 가수는 matcher 'artist') · 초성 · 실패 넘김 과반 · 설정 검증 · 칩 수
import { describe, expect, it } from 'vitest';
import { DEFAULT_SONG_SETTINGS, matchSong, songInitials, songRangeCounts, validateRoomSettings, validateSongSettings, normalizeAnswer, flexMatch } from '@quiz/shared';
import { noteSongFail, pickNextSong, songAnswerSets, songEntryOf, songPoolFrom, songRevealOf, type SongRun } from './mode.js';

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  payload: {
    title: '좋은 날',
    titleVariants: ['Good Day', '좋은날'],
    artist: '아이유',
    artistVariants: ['IU'],
    year: 2010,
    category: 'kr',
    genre: '발라드',
    titleKo: '좋은 날',
    itunes: { trackId: 1, previewUrl: 'https://audio-ssl.itunes.apple.com/x.m4a', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.jpg', trackName: 'Good Day', artistName: 'IU' },
    ...over,
  },
});
const all = { ...DEFAULT_SONG_SETTINGS };

describe('R096 노래 방식 — 범위', () => {
  it('분류 · 장르 · 연대 · 20세기 명곡 토글', () => {
    const items = [
      item('song-0001'),
      item('song-0002', { category: 'pop', genre: '팝', year: 2015 }),
      item('song-0003', { category: 'jpop', genre: null, year: 2021 }),
      item('song-0004', { year: 1995, legend: true }),
      item('song-0005', { year: 2003, genre: '아이돌' }),
    ];
    expect(songPoolFrom(items, all).map((e) => e.id)).toEqual(['song-0001', 'song-0002', 'song-0003', 'song-0004', 'song-0005']);
    expect(songPoolFrom(items, { ...all, songCategories: ['pop'] }).map((e) => e.id)).toEqual(['song-0002']);
    expect(songPoolFrom(items, { ...all, songGenres: ['아이돌'] }).map((e) => e.id)).toEqual(['song-0002', 'song-0003', 'song-0005']);
    expect(songPoolFrom(items, { ...all, songDecades: ['2010'], songLegend: false }).map((e) => e.id)).toEqual(['song-0001', 'song-0002']);
    expect(songPoolFrom(items, { ...all, songDecades: [], songLegend: true }).map((e) => e.id)).toEqual(['song-0004']);
  });
  it('20세기 곡은 legend 일 때만 · 미리듣기 없는 항목 제외 · 연습 곡 trackId 는 방식에서는 낸다', () => {
    expect(songPoolFrom([item('song-0001', { year: 1990 })], all)).toEqual([]);
    expect(songEntryOf(item('song-0001', { itunes: { previewUrl: '' } }))).toBeNull();
    expect(songEntryOf(item('song-0001', { itunes: { trackId: 984607460, previewUrl: 'https://x' } }))).not.toBeNull();
  });
  it('칩 수 — 그 칩만 켰을 때', () => {
    const metas = [
      { category: 'kr', genre: '발라드', year: 2010 },
      { category: 'kr', genre: '아이돌', year: 2021 },
      { category: 'pop', genre: null, year: 2012 },
    ];
    const c = songRangeCounts(metas, { ...all, songCategories: ['kr'] });
    expect(c.total).toBe(2);
    expect(c.category).toEqual({ kr: 2, pop: 1, jpop: 0 });
    expect(c.genre['트로트']).toBe(0);
    expect(c.decade['2010']).toBe(1);
  });
});

describe('R096 노래 방식 — 다음 곡', () => {
  const run = (ids: string[]): SongRun => ({ pool: ids.map((id) => songEntryOf(item(id))!), used: new Set(), runId: null, rounds: new Map() });
  it('들은 사람 적은 곡 먼저 · 이 판 중복 0 · 바닥나면 null', () => {
    const r = run(['song-0001', 'song-0002']);
    const exp = new Map([['a', new Set(['song|song-0001'])]]);
    const p1 = pickNextSong(r, ['a', 'b'], exp, () => 0)!;
    expect(p1.entry.id).toBe('song-0002');
    expect(p1.experiencedBy.size).toBe(0);
    r.used.add('song-0002');
    const p2 = pickNextSong(r, ['a', 'b'], exp, () => 0)!;
    expect(p2.entry.id).toBe('song-0001');
    expect([...p2.experiencedBy]).toEqual(['a']);
    r.used.add('song-0001');
    expect(pickNextSong(r, ['a'], exp)).toBeNull();
  });
  it('이 노래 몇 년도?(songyear)로 들은 곡도 들은 곡', () => {
    const r = run(['song-0001', 'song-0002']);
    const exp = new Map([['a', new Set(['songyear|song-0002'])]]);
    expect(pickNextSong(r, ['a'], exp, () => 0)!.entry.id).toBe('song-0001');
  });
});

describe('R096 노래 방식 — 판정 재료', () => {
  const e = songEntryOf(item('song-0001'))!;
  const s = songAnswerSets(e);
  it('제목 변형 · trackName 은 정답 · 가수는 정답 아님(matcher artist)', () => {
    for (const t of ['좋은 날', '좋은날', 'good day', 'Good Day']) expect(s.answersNorm.has(normalizeAnswer(t)) || flexMatch(t, s.answersNorm, s.answersFlex)).toBe(true);
    expect(s.answersNorm.has(normalizeAnswer('아이유'))).toBe(false);
    expect(matchSong(s.matcher, '아이유')).toBe('artist');
    expect(matchSong(s.matcher, 'IU')).toBe('artist');
    expect(matchSong(s.matcher, '좋은 날')).toBe('title');
  });
  it('초성 = titleKo 낱말마다 · 숫자 꼴', () => {
    expect(s.hint).toBe('ㅈㅇ ㄴ');
    expect(songInitials('러브 다이브')).toBe('ㄹㅂ ㄷㅇㅂ');
    expect(songInitials('2002')).toBe('____');
    expect(songInitials('')).toBeNull();
  });
  it('공개 = 600 표지 · 칩', () => {
    const r = songRevealOf(e);
    expect(r.cover).toBe('https://is1-ssl.mzstatic.com/a/600x600bb.jpg');
    expect(r.chips).toEqual(['한국 발라드', '2010년대']);
  });
  it('미리듣기 실패 — 접속자 과반이면 넘김 · 같은 사람 두 번은 한 번', () => {
    const q = { entry: e, matcher: s.matcher, durationMs: 30_000 };
    expect(noteSongFail(q, 'a', 3)).toBe(false);
    expect(noteSongFail(q, 'a', 3)).toBe(false);
    expect(noteSongFail(q, 'b', 3)).toBe(true);
  });
});

describe('R096 노래 방식 — 설정', () => {
  it('기본 · 곡 수 범위 · 빈 분류 · 빈 연대(명곡도 끔)', () => {
    expect(validateSongSettings({})).toMatchObject({ ok: true, value: { songCount: 10, songLegend: true } });
    expect(validateSongSettings({ songCount: 4 }).ok).toBe(false);
    expect(validateSongSettings({ songCount: 21 }).ok).toBe(false);
    expect(validateSongSettings({ songCategories: [] }).ok).toBe(false);
    expect(validateSongSettings({ songDecades: [], songLegend: false }).ok).toBe(false);
    expect(validateSongSettings({ songDecades: [], songLegend: true }).ok).toBe(true);
    expect(validateSongSettings({ songCategories: ['pop'], songGenres: [] }).ok).toBe(true);
    expect(validateSongSettings({ songGenres: [] }).ok).toBe(false);
  });
  it('방 설정 — mode song 통과 · 노래 칸이 실린다', () => {
    const r = validateRoomSettings({ questionCount: 20, mode: 'song', songCount: 7, songCategories: ['kr', 'kr', 'pop'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.mode).toBe('song');
      expect(r.settings.songCount).toBe(7);
      expect(r.settings.songCategories).toEqual(['kr', 'pop']);
    }
  });
});
