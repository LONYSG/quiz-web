// =============================================================================
// ★★★ R096 — 노래 맞히기 = 방 "방식"(D-353 · 찬종 실전 제보 #117 2026-11-10 · 2026-11-11 답)
//
// ★ 찬종: "노래 맞히기는 캐치마인드·라이어게임처럼 따로 빼자. 라운드 개수만큼 문제 수가 나오는 걸로. 노래 분류를 한국(발라드 · 댄스 · 아이돌 등) ·
//   팝송 · J-pop 으로 세분화하고 연도도 10년 단위로 끊자 … 15초 남았을 때 초성 힌트. 스킵 투표도. 기존 퀴즈랑 비슷한 형식 … 일반 퀴즈들처럼 채팅창에서."
//   + "기존 퀴즈 시스템과 비슷하게 기능 다 — 정답 후 세레모니 등등까지"
// ★ 판 흐름 = **퀴즈 흐름 그대로**(QUESTION_ACTIVE → QUESTION_RESOLVED 8초 → 다음 곡 · 스킵 투표 · 방장 스킵 · 일시정지 · 재접속 · 빵빠레 ·
//   소감 칸 · 뒷북 · 경험자 마스킹 · 평가) — 다른 것만: 곡 30초 · 일반 힌트 없음 · 15초 초성(titleKo) · 판정 = 제목만(가수 = 본인 알림) ·
//   점수 = 첫 사람 +1(퀴즈와 같다) · 맞힌 글은 채팅에 안 나가고 시스템 줄 · 판 중 앨범 표지 시계 공개(C-3).
// ★ 이 파일 = 순수 상수 · 함수(서버 출제 · 화면 설정이 같이 쓴다). 곡 데이터 칸은 docs/18 §10 R096.
// =============================================================================

import { generateHint } from './hint.js';

export const SONG_MODE = {
  /** 곡 수(= 라운드 수) */
  ROUNDS: { MIN: 5, MAX: 20, DEFAULT: 10 },
  /** 곡마다 — 미리듣기 길이 */
  PLAY_MS: 30_000,
  /** 남은 시간이 이만큼일 때 초성(퀴즈 HINT_REVEAL_AT_MS 와 같은 값 · 같은 자리) */
  HINT_AT_MS: 15_000,
  /** 정답 점수 — 첫 사람만(R092 · 퀴즈와 같다) */
  POINT: 1,
} as const;

export type SongCategory = 'kr' | 'pop' | 'jpop';
export const SONG_CATEGORIES: readonly { key: SongCategory; label: string }[] = [
  { key: 'kr', label: '한국' },
  { key: 'pop', label: '팝' },
  { key: 'jpop', label: 'J-pop' },
];
export function isSongCategory(v: unknown): v is SongCategory {
  return v === 'kr' || v === 'pop' || v === 'jpop';
}

/** 연대(year 에서 계산 — 18 §10 "연대 칸 없음") · legend = "20세기 명곡" 토글 */
export type SongDecade = '2000' | '2010' | '2020';
export const SONG_DECADES: readonly { key: SongDecade; label: string }[] = [
  { key: '2000', label: '2000년대' },
  { key: '2010', label: '2010년대' },
  { key: '2020', label: '2020년대' },
];
export function isSongDecade(v: unknown): v is SongDecade {
  return v === '2000' || v === '2010' || v === '2020';
}

/** 한국 세부 장르(18 §10 R096 · 적재 검사 minigame-song.mjs SONG_KR_GENRES 와 같은 9종 · 순서 = 칩 순서) */
export const SONG_KR_GENRES = ['아이돌', '발라드', '댄스', '힙합', 'R&B', '록/밴드', 'OST', '트로트', '포크/인디'] as const;
export type SongKrGenre = (typeof SONG_KR_GENRES)[number];
export function isSongKrGenre(v: unknown): v is SongKrGenre {
  return typeof v === 'string' && (SONG_KR_GENRES as readonly string[]).includes(v);
}

/** 방 설정의 노래 칸(RoomSettingsInput 에 들어간다) */
export interface SongSettings {
  songCount: number;
  songCategories: SongCategory[];
  songDecades: SongDecade[];
  /** "20세기 명곡"(legend 곡) 포함 — 기본 켬 */
  songLegend: boolean;
  /** 한국 세부 장르(분류에 한국이 있을 때만 씀) */
  songGenres: SongKrGenre[];
}

export const DEFAULT_SONG_SETTINGS: SongSettings = {
  songCount: SONG_MODE.ROUNDS.DEFAULT,
  songCategories: SONG_CATEGORIES.map((c) => c.key),
  songDecades: SONG_DECADES.map((d) => d.key),
  songLegend: true,
  songGenres: [...SONG_KR_GENRES],
};

/** 곡 하나의 고르기 칸(적재 payload 에서) */
export interface SongMeta {
  category?: string | null;
  genre?: string | null;
  year: number;
  legend?: boolean | null;
}

/** 곡의 연대 키 — 21세기면 '2000' · '2010' · '2020' · 20세기면 null(legend 토글로만) */
export function songDecadeOf(year: number): SongDecade | null {
  if (year >= 2020) return '2020';
  if (year >= 2010) return '2010';
  if (year >= 2000) return '2000';
  return null;
}

/**
 * ★ 이 곡이 방 설정 범위 안인가 — 분류 · (한국이면) 세부 장르 · 연대(21세기) 또는 20세기 명곡(legend 토글).
 *   20세기 곡은 legend 일 때만(G061 — 나머지는 적재에서 이미 inactive) · 연대 칩과 무관하게 토글이 정한다.
 */
export function songInRange(m: SongMeta, s: Pick<SongSettings, 'songCategories' | 'songDecades' | 'songLegend' | 'songGenres'>): boolean {
  if (!isSongCategory(m.category) || !s.songCategories.includes(m.category)) return false;
  if (m.category === 'kr' && !(isSongKrGenre(m.genre) && s.songGenres.includes(m.genre))) return false;
  const d = songDecadeOf(m.year);
  if (d === null) return s.songLegend && m.legend === true;
  return s.songDecades.includes(d);
}

/** 분류 · 장르 · 연대 칩 옆 곡 수(로비 — 곡 0 인 칩은 흐리게) */
export function songRangeCounts(items: readonly SongMeta[], s: SongSettings): {
  total: number;
  category: Record<SongCategory, number>;
  decade: Record<SongDecade, number>;
  legend: number;
  genre: Record<string, number>;
} {
  const category = { kr: 0, pop: 0, jpop: 0 } as Record<SongCategory, number>;
  const decade = { '2000': 0, '2010': 0, '2020': 0 } as Record<SongDecade, number>;
  const genre: Record<string, number> = Object.fromEntries(SONG_KR_GENRES.map((g) => [g, 0]));
  let legend = 0;
  let total = 0;
  for (const m of items) {
    if (songInRange(m, s)) total += 1;
    // 칩 하나의 수 = 그 칩만 바꿔 켰을 때 그 칩에 드는 곡(다른 칸은 지금 설정 그대로)
    if (isSongCategory(m.category) && songInRange(m, { ...s, songCategories: [m.category] })) category[m.category] += 1;
    const d = songDecadeOf(m.year);
    if (d && songInRange(m, { ...s, songDecades: [d] })) decade[d] += 1;
    if (d === null && songInRange(m, { ...s, songLegend: true })) legend += 1;
    if (m.category === 'kr' && isSongKrGenre(m.genre) && songInRange(m, { ...s, songCategories: ['kr'], songGenres: [m.genre] })) genre[m.genre] = (genre[m.genre] ?? 0) + 1;
  }
  return { total, category, decade, legend, genre };
}

/**
 * ★ 초성 힌트(15초) — titleKo 를 낱말마다 퀴즈 초성 함수로(띄어쓰기 유지 · 캐치마인드 drawInitials 와 같은 꼴):
 *   "러브 다이브" → "ㄹㅂ ㄷㅇㅂ" · "2002" → "____"(화면이 hintKind 로 "숫자 4자리") · 못 만들면 null
 */
export function songInitials(titleKo: string | null | undefined): string | null {
  const t = (titleKo ?? '').trim();
  if (!t) return null;
  const words = t.split(/\s+/).filter(Boolean).map((w) => generateHint(w));
  if (words.every((w) => w === null)) return null;
  return words.map((w) => w ?? '_').join(' ');
}

/** 앨범 표지 큰 판(18 §10 — artworkUrl100 의 100x100bb → 600x600bb) */
export function songCover600(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  return url.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/i, '/600x600bb.$1');
}

/** 공개 칩 한 줄 — "한국 아이돌 · 2010년대" · "팝 · 20세기 명곡" */
export function songChips(m: SongMeta): string[] {
  const cat = SONG_CATEGORIES.find((c) => c.key === m.category)?.label ?? null;
  const d = songDecadeOf(m.year);
  const head = cat ? (m.category === 'kr' && m.genre ? `${cat} ${m.genre}` : cat) : null;
  return [head, d ? SONG_DECADES.find((x) => x.key === d)!.label : m.legend ? '20세기 명곡' : null].filter((x): x is string => !!x);
}

/** 설정 검증(validateRoomSettings 가 부른다) — 없으면 기본 · 틀리면 문구 */
export function validateSongSettings(raw: Partial<Record<keyof SongSettings, unknown>>): { ok: true; value: SongSettings } | { ok: false; message: string } {
  const out: SongSettings = { ...DEFAULT_SONG_SETTINGS, songCategories: [...DEFAULT_SONG_SETTINGS.songCategories], songDecades: [...DEFAULT_SONG_SETTINGS.songDecades], songGenres: [...DEFAULT_SONG_SETTINGS.songGenres] };
  if (raw.songCount !== undefined) {
    const n = raw.songCount;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < SONG_MODE.ROUNDS.MIN || n > SONG_MODE.ROUNDS.MAX) return { ok: false, message: `곡 수는 ${SONG_MODE.ROUNDS.MIN}~${SONG_MODE.ROUNDS.MAX} 사이여야 합니다.` };
    out.songCount = n;
  }
  const list = <T extends string>(v: unknown, all: readonly T[], is: (x: unknown) => x is T, label: string): T[] | string => {
    if (v === undefined) return [...all];
    if (!Array.isArray(v) || !v.every((x) => is(x))) return `${label} 형식이 올바르지 않습니다.`;
    return all.filter((x) => (v as unknown[]).includes(x));
  };
  const cats = list(raw.songCategories, SONG_CATEGORIES.map((c) => c.key), isSongCategory, '노래 분류');
  if (typeof cats === 'string') return { ok: false, message: cats };
  if (cats.length === 0) return { ok: false, message: '노래 분류를 하나 이상 골라 주세요.' };
  out.songCategories = cats;
  const decs = list(raw.songDecades, SONG_DECADES.map((d) => d.key), isSongDecade, '연대');
  if (typeof decs === 'string') return { ok: false, message: decs };
  out.songDecades = decs;
  if (raw.songLegend !== undefined) {
    if (typeof raw.songLegend !== 'boolean') return { ok: false, message: '20세기 명곡 설정 형식이 올바르지 않습니다.' };
    out.songLegend = raw.songLegend;
  }
  if (out.songDecades.length === 0 && !out.songLegend) return { ok: false, message: '연대를 하나 이상 골라 주세요.' };
  const gens = list(raw.songGenres, SONG_KR_GENRES, isSongKrGenre, '장르');
  if (typeof gens === 'string') return { ok: false, message: gens };
  if (gens.length === 0 && out.songCategories.includes('kr')) return { ok: false, message: '한국 장르를 하나 이상 골라 주세요.' };
  out.songGenres = gens;
  return { ok: true, value: out };
}

/** 범위 안 곡이 모자랄 때(시작 전 안내) */
export function songNotEnoughMessage(available: number, wanted: number): string {
  return `고른 범위의 노래가 ${available}곡뿐이에요. 곡 수를 ${available}곡 이하로 줄이거나 범위를 넓혀 주세요. (요청 ${wanted}곡)`;
}
