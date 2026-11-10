// =============================================================================
// ★★★ R084 — 노래 미니게임 둘 (D-341 · docs/18 §10 · 찬종 2026-11-08 ⑻ "30초 듣고 제목·가수 + 이 노래 몇 년도?")
//
// ★ 노래 맞히기(song): 곡마다 30초(미리듣기 길이) · 글 입력(Enter 마다) · 판정 = 제목(title · titleVariants · iTunes trackName)
//   **또는** 가수(artist · artistVariants · iTunes artistName) — 퀴즈와 같은 정규화(normalizeAnswer · flexCanon · 끝맺음).
//   점수 = 처음 맞힌 순서 3 · 2 · 1(그 뒤 1) + 제목 · 가수 둘 다 +1 · 남의 답 안 보임 · 전원이 하나라도 맞히면 일찍 공개.
// ★ 이 노래 몇 년도?(songyear): 20초 듣고 연도 4자리(바꿀 수 있음 — 마지막) · 오차(년) 작은 순(photoyear 꼴 · ±1 부분점수 없음).
// ★ 소리: 각 화면이 Apple 미리듣기(previewUrl)를 스트리밍(서버는 판 시작 시각만) · 저장 · 캐시 안 함.
//   재생 실패를 접속자 과반이 보고하면 그 곡은 건너뜀(전원 0).
// ★ 이 파일은 순수 함수 · 상수만(서버 판정 · 화면 표시가 같이 쓴다).
// =============================================================================

import { buildTopicMatcher, matchTopic } from './topics.js';

export const SONG_ROUNDS = 3;
/** 노래 맞히기 — 곡마다(미리듣기 30초) */
export const SONG_PLAY_MS = 30_000;
/** 이 노래 몇 년도? — 곡마다 */
export const SONGYEAR_PLAY_MS = 20_000;
/** 준비(곡 사이 — 다음 곡을 받는 시간) */
export const SONG_READY_MS = 2_000;
/** 공개(그림 · 제목 · 가수 · 누가 뭘 맞혔나 — 노래는 계속 흐른다) */
export const SONG_REVEAL_MS = 6_000;
/** 처음 맞힌 순서 점수(그 뒤는 SONG_LATE_POINTS) */
export const SONG_ORDER_POINTS: readonly number[] = [3, 2, 1];
export const SONG_LATE_POINTS = 1;
/** 제목 · 가수 둘 다 맞히면 */
export const SONG_BOTH_BONUS = 1;
/** 판 하나의 입력 상한(도배 방지) */
export const SONG_MAX_TRIES = 80;
/** 입력 글 상한 */
export const SONG_TEXT_MAX = 40;
/** 연도 입력 범위 */
export const SONGYEAR_MIN = 1950;
/** 볼륨 기본(0~1 — 화면 설정 · 효과음 끔과 별개) */
export const SONG_VOLUME_DEFAULT = 0.7;
/** 같은 판 3곡이 한 pool 만 되지 않게 다시 고르는 횟수 */
export const SONG_POOL_RETRIES = 12;

export type SongPart = 'title' | 'artist';

/** 판정에 필요한 것(항목 payload 에서) */
export interface SongCore {
  title: string;
  titleVariants?: readonly string[];
  artist: string;
  artistVariants?: readonly string[];
  itunes?: { trackName?: string; artistName?: string } | null;
}

/** 제목 · 가수 판정 맵 (열쇠 → 'title' | 'artist') — 제목이 앞선다(같은 열쇠면 제목) */
export function songMatcher(s: SongCore): Map<string, string> {
  const tv = [...(s.titleVariants ?? []), ...(s.itunes?.trackName ? [s.itunes.trackName] : [])];
  const av = [...(s.artistVariants ?? []), ...(s.itunes?.artistName ? [s.itunes.artistName] : [])];
  return buildTopicMatcher([
    { id: 'title', name: s.title, variants: tv },
    { id: 'artist', name: s.artist, variants: av },
  ], { dropFlexConflicts: false });
}

export function matchSong(matcher: ReadonlyMap<string, string>, raw: string): SongPart | null {
  const id = matchTopic(matcher, raw);
  return id === 'title' || id === 'artist' ? id : null;
}

/**
 * ★ 노래 맞히기 점수 — 처음 하나라도 맞힌 시각 순으로 3 · 2 · 1(그 뒤 1) + 둘 다 +1. 같은 시각은 같은 점수.
 *   hits: 계정 → { firstMs(처음 맞힌 ms) · both }
 */
export function songPoints(hits: ReadonlyMap<string, { firstMs: number; both: boolean }>): Map<string, number> {
  const sorted = [...hits.entries()].sort((a, b) => a[1].firstMs - b[1].firstMs);
  const out = new Map<string, number>();
  let prevMs: number | null = null;
  let prevIdx = 0;
  sorted.forEach(([a, h], i) => {
    const idx = prevMs !== null && h.firstMs === prevMs ? prevIdx : i;
    prevMs = h.firstMs;
    prevIdx = idx;
    out.set(a, (SONG_ORDER_POINTS[idx] ?? SONG_LATE_POINTS) + (h.both ? SONG_BOTH_BONUS : 0));
  });
  return out;
}

/** ★ 재생 실패로 그 곡을 건너뛰나 — 실패 보고가 접속자(또는 참가자)의 과반 */
export function songFailSkip(fails: number, people: number): boolean {
  return people > 0 && fails * 2 > people;
}

/** 이 노래 몇 년도? 오차(년) */
export function songYearError(guess: number, year: number): number {
  return Math.abs(guess - year);
}

/** 연도 입력 상한(올해) */
export function songYearMax(nowMs: number = Date.now()): number {
  return new Date(nowMs).getUTCFullYear();
}

/** ★ 연습 판 — 실제 미리듣기 셋(소리가 나야 연습이 된다) · 이 셋은 실제 판에 뽑지 않는다(trackId) */
export const SONG_DUMMY = [
  {
    id: 'dummy-song-1',
    title: 'Uptown Funk',
    titleVariants: ['업타운 펑크'],
    artist: 'Mark Ronson',
    artistVariants: ['마크 론슨', 'Bruno Mars', '브루노 마스'],
    year: 2014,
    itunes: {
      trackId: 984607460,
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/e4/d7/f3/e4d7f372-46d9-db30-5428-c138aff5d0da/mzaf_2021409170362715302.plus.aac.p.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music5/v4/5c/eb/9d/5ceb9d47-c80d-a70a-1842-a8ca347bcc8e/886445222081.jpg/100x100bb.jpg',
    },
  },
  {
    id: 'dummy-song-2',
    title: '쏘리 쏘리',
    titleVariants: ['Sorry, Sorry', '쏘리쏘리'],
    artist: '슈퍼주니어',
    artistVariants: ['SUPER JUNIOR', '슈주'],
    year: 2009,
    itunes: {
      trackId: 854890251,
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/41/83/14/418314c8-75b8-a609-0206-57e55a77a7e3/mzaf_870384710444515739.plus.aac.p.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/d4/f5/55/d4f555bb-e12d-807d-2c12-f8817f0fa6e7/asset.jpg/100x100bb.jpg',
    },
  },
  {
    id: 'dummy-song-3',
    title: 'The Power of Love',
    titleVariants: ['파워 오브 러브'],
    artist: 'Céline Dion',
    artistVariants: ['Celine Dion', '셀린 디온'],
    year: 1993,
    itunes: {
      trackId: 1057578790,
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/89/d6/f8/89d6f8b7-3174-1a72-3f48-c44d4a9b5d23/mzaf_14605425500303508811.plus.aac.p.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/d4/46/90/d446905a-aac0-b7b2-ea83-fff76cedfdf2/884977419726.jpg/100x100bb.jpg',
    },
  },
] as const;
export const SONG_DUMMY_TRACK_IDS: ReadonlySet<number> = new Set(SONG_DUMMY.map((d) => d.itunes.trackId));
