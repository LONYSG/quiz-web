// =============================================================================
// ★★★ R084 — 노래 둘 (D-341 · docs/18 §10): 노래 맞히기(song) · 이 노래 몇 년도?(songyear)
//
// ★ 항목 = 적재본 minigame_items.game 'song'(minigame-load — verified 만 · 실 DB 는 V041 뒤) · 두 게임이 같은 항목을 쓴다.
//   경험 = 'song|<id>' · 'songyear|<id>'(엔진이 run.key 로 기록) — 고를 때는 둘 중 어느 쪽으로 들었어도 "들은 곡"으로 본다.
//   같은 게임(판) 안에서 한 게임이 낸 곡은 다른 게임이 내지 않는다(쓴 소재 'song|<id>' 를 같이 쓴다).
//   한 판 3곡이 한 pool(kpop-year …)만 되지 않게 시드를 바꿔 다시 고른다(그래도 안 되면 그대로).
// ★ 소리는 서버가 다루지 않는다 — params.previewUrl 만 보내고 각 화면이 스트리밍한다(판 시작 시각 = 엔진 phaseStartedAt).
//   화면이 재생 실패를 보고하면({ fail: true }) 접속자 과반일 때 그 곡을 건너뛴다(earlyEnd → finalizeRound 에서 전원 0 · reveal.skipped).
// ★ 공개 = 제목 · 가수 · 연도 · 앨범 그림(artworkUrl100) · 누가 뭘 맞혔나(행 extra) — 판 중에는 그림 · 글 없음(정답 노출).
// =============================================================================

import {
  QUIZ_PRACTICE_ITEMS,
  SONG_DUMMY,
  SONG_DUMMY_TRACK_IDS,
  SONG_MAX_TRIES,
  SONG_PLAY_MS,
  SONG_POOL_RETRIES,
  SONG_READY_MS,
  SONG_REVEAL_MS,
  SONG_ROUNDS,
  SONG_TEXT_MAX,
  SONGYEAR_MIN,
  SONGYEAR_PLAY_MS,
  matchSong,
  minigameInfo,
  pickQuizItems,
  songFailSkip,
  songMatcher,
  songPoints,
  songYearError,
  songYearMax,
  type SongCore,
  type SongPart,
} from '@quiz/shared';
import type { QuizItem } from '../db/minigameItems.js';
import type { BuildCtx, MinigameDef, ParsedInput, RoundSpec } from './defs.js';
import { deviceElapsed } from './defs.js';

export const SONG_KEYS = new Set(['song', 'songyear']);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const objOf = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null);

interface SongPayload extends SongCore {
  year: number;
  pool?: string;
  itunes: { trackId?: number; previewUrl?: string; artworkUrl100?: string; trackName?: string; artistName?: string };
}
const payloadOf = (it: QuizItem) => it.payload as unknown as SongPayload;

/** 쓸 수 있는 항목 — 미리듣기 주소가 있고 · 연습 곡이 아닌 것 */
export function songPool(items: readonly QuizItem[]): QuizItem[] {
  return items.filter((it) => {
    const p = payloadOf(it);
    return typeof p.itunes?.previewUrl === 'string' && p.itunes.previewUrl.startsWith('https://') && !SONG_DUMMY_TRACK_IDS.has(Number(p.itunes.trackId));
  });
}

/** ★ 곡 고르기 — 들은 곡(두 게임 어느 쪽이든) 적은 순 · 이 게임에서 쓴 곡 피하기 · 한 pool 만 되지 않게 다시 고르기 */
export function pickSongs(key: 'song' | 'songyear', seed: number, ctx: BuildCtx) {
  const q = ctx.quiz;
  if (!q) return null;
  const pool = songPool(q.data.items.song ?? []);
  const exp = q.experienced;
  const heard = (a: string, id: string) => (exp.get(a)?.has(`song|${id}`) ?? false) || (exp.get(a)?.has(`songyear|${id}`) ?? false);
  const used = (q.used ??= new Set<string>());
  const materialOf = (it: QuizItem) => `song|${it.id}`;
  const pools = new Set(pool.map((it) => payloadOf(it).pool));
  let pick = null as ReturnType<typeof pickQuizItems<QuizItem>>;
  for (let k = 0; k <= SONG_POOL_RETRIES; k += 1) {
    const p = pickQuizItems(pool, ctx.participants, heard, SONG_ROUNDS, seed + k * 7919, { materialOf, avoid: used, ignoreSeen: ctx.ignoreSeen });
    if (!p) return null;
    pick = p;
    // 쓰지 않은 소재만으로 골랐는데(앞 게임 곡과 겹침 없음) pool 이 섞였으면 끝
    const mixed = pools.size < 2 || new Set(p.items.map((it) => payloadOf(it).pool)).size > 1;
    if (mixed) break;
  }
  if (!pick) return null;
  for (const it of pick.items) used.add(materialOf(it));
  void key;
  return pick;
}

type Secret = { matcher: Map<string, string>; year: number; n: number; skipped?: boolean };
const secretOf = (spec: RoundSpec) => spec.secret as unknown as Secret;

function revealOf(p: { title: string; artist: string; year: number; itunes: { artworkUrl100?: string } }) {
  return { title: p.title, artist: p.artist, year: p.year, artworkUrl: p.itunes?.artworkUrl100 ?? null };
}

function buildSongRounds(key: 'song' | 'songyear', seed: number, ctx: BuildCtx): RoundSpec[] | null {
  const playMs = key === 'song' ? SONG_PLAY_MS : SONGYEAR_PLAY_MS;
  const n = ctx.participants.length;
  const base = (i: number) => ({ playMs, readyMs: SONG_READY_MS, resultMs: SONG_REVEAL_MS, seed: seed + i });
  const yearParams = key === 'songyear' ? { min: SONGYEAR_MIN, max: songYearMax(ctx.now) } : {};
  if (ctx.practice) {
    return SONG_DUMMY.slice(0, Math.min(QUIZ_PRACTICE_ITEMS, SONG_ROUNDS)).map((d, i) => ({
      ...base(i),
      itemKey: d.id,
      params: { previewUrl: d.itunes.previewUrl, ...yearParams, dummy: true },
      reveal: revealOf(d as unknown as SongPayload),
      secret: { matcher: songMatcher(d as unknown as SongCore), year: d.year, n } as unknown as Record<string, unknown>,
    }));
  }
  const pick = pickSongs(key, seed, ctx);
  if (!pick) return null;
  return pick.items.map((it, i) => {
    const p = payloadOf(it);
    return {
      ...base(i),
      itemKey: it.id,
      itemId: it.id,
      params: { previewUrl: p.itunes.previewUrl, ...yearParams },
      reveal: revealOf(p),
      secret: { matcher: songMatcher(p), year: p.year, n } as unknown as Record<string, unknown>,
      experiencedBy: pick.experiencedBy.get(it.id),
    };
  });
}

/** 재생 실패 보고 — 앞 기록을 그대로 두고 fail 만 켠다 */
function withFail(prev: (ParsedInput & { provisional: boolean }) | undefined): ParsedInput & { provisional: boolean } {
  return {
    input: { ...(prev?.input ?? {}), fail: true },
    value: prev?.value ?? null,
    error: prev?.error ?? null,
    elapsedMs: prev?.elapsedMs ?? null,
    submitted: prev?.submitted ?? false,
    extra: { ...(prev?.extra ?? {}), fail: true },
    provisional: true,
  };
}

const failsOf = (subs: ReadonlyMap<string, ParsedInput & { provisional: boolean }>) => [...subs.values()].filter((s) => s.extra?.fail === true).length;

/** 접속자 과반 실패 → 그 곡 건너뜀(표시) */
function failEarly(spec: RoundSpec, subs: ReadonlyMap<string, ParsedInput & { provisional: boolean }>, connected: readonly string[]): boolean {
  const fails = [...connected].filter((a) => subs.get(a)?.extra?.fail === true).length;
  if (songFailSkip(fails, connected.length)) {
    secretOf(spec).skipped = true;
    return true;
  }
  return false;
}

function skippedFinal(spec: RoundSpec, subs: ReadonlyMap<string, ParsedInput & { provisional: boolean }>) {
  const sec = secretOf(spec);
  const fails = failsOf(subs);
  if (!sec.skipped && !songFailSkip(fails, sec.n)) return null;
  sec.skipped = true;
  console.log(`[minigame] 노래 건너뜀 — 미리듣기 실패 ${fails}/${sec.n}명 (${spec.itemKey})`);
  const values = new Map<string, { value: number | null; extra?: Record<string, unknown> }>();
  for (const a of subs.keys()) values.set(a, { value: null, extra: { skipped: true } });
  return { values, reveal: { ...(spec.reveal ?? {}), skipped: true, fails } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 노래 맞히기
// ─────────────────────────────────────────────────────────────────────────────
export const song: MinigameDef = {
  key: 'song',
  info: minigameInfo('song'),
  buildRounds: (seed, ctx) => buildSongRounds('song', seed, ctx),
  parseInput(raw, spec, ctx) {
    const obj = objOf(raw);
    if (obj?.fail === true) return ctx.prev?.extra?.fail ? null : withFail(ctx.prev);
    const t = typeof obj?.text === 'string' ? [...obj.text.trim()].slice(0, SONG_TEXT_MAX).join('') : '';
    if (!t) return null;
    const ex = ctx.prev?.extra ?? {};
    const tries = Number(ex.tries ?? 0) + 1;
    if (tries > SONG_MAX_TRIES) return null;
    const got = { title: ex.title === true, artist: ex.artist === true };
    let firstMs = num(ex.firstMs);
    let bothMs = num(ex.bothMs);
    const part: SongPart | null = matchSong(secretOf(spec).matcher, t);
    const at = deviceElapsed(obj, spec, ctx, true) ?? Math.min(ctx.serverElapsedMs, spec.playMs);
    let feedback: Record<string, unknown>;
    if (part && got[part]) feedback = { result: 'dup', part, text: t };
    else if (part) {
      got[part] = true;
      if (firstMs === null) firstMs = Math.round(at);
      if (got.title && got.artist && bothMs === null) bothMs = Math.round(at);
      feedback = { result: 'ok', part, text: t, title: got.title, artist: got.artist };
    } else feedback = { result: 'wrong', text: t };
    const hit = got.title || got.artist;
    return {
      input: { last: t, tries, ...(ex.fail ? { fail: true } : {}) },
      // 판 끝 정산(finalizeRound)이 점수로 바꾼다 — 그 전 값은 "맞혔나" 표시만
      value: hit ? 1 : null,
      error: null,
      elapsedMs: firstMs,
      submitted: hit,
      extra: { ...ex, title: got.title, artist: got.artist, firstMs, bothMs, tries },
      provisional: true,
      feedback,
    };
  },
  // ★ 전원이 하나라도 맞혔으면 일찍 공개 · 접속자 과반이 재생 실패면 그 곡 건너뜀
  earlyEnd(spec, subs, connected) {
    if (failEarly(spec, subs, connected)) return true;
    return connected.length > 0 && connected.every((a) => {
      const e = subs.get(a)?.extra;
      return e?.title === true || e?.artist === true;
    });
  },
  finalizeRound(spec, subs) {
    const sk = skippedFinal(spec, subs);
    if (sk) return sk;
    const hits = new Map<string, { firstMs: number; both: boolean }>();
    for (const [a, s] of subs) {
      const e = s.extra ?? {};
      if ((e.title === true || e.artist === true) && num(e.firstMs) !== null) hits.set(a, { firstMs: Number(e.firstMs), both: e.title === true && e.artist === true });
    }
    const pts = songPoints(hits);
    const values = new Map<string, { value: number | null; extra?: Record<string, unknown> }>();
    for (const a of subs.keys()) values.set(a, { value: pts.get(a) ?? null, extra: { points: pts.get(a) ?? 0 } });
    return { values, reveal: spec.reveal };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 이 노래 몇 년도?
// ─────────────────────────────────────────────────────────────────────────────
export const songyear: MinigameDef = {
  key: 'songyear',
  info: minigameInfo('songyear'),
  buildRounds: (seed, ctx) => buildSongRounds('songyear', seed, ctx),
  // 끝까지 바꿀 수 있다(마지막 값) — 낸 사람 수는 임시 값으로 센다
  countProvisional: true,
  parseInput(raw, spec, ctx) {
    const obj = objOf(raw);
    if (obj?.fail === true) return ctx.prev?.extra?.fail ? null : withFail(ctx.prev);
    const v = num(obj?.value);
    const max = Number(spec.params.max ?? songYearMax());
    const min = Number(spec.params.min ?? SONGYEAR_MIN);
    if (v === null || !Number.isInteger(v) || v < min || v > max) return null;
    const elapsed = deviceElapsed(obj, spec, ctx, true);
    const year = Number(secretOf(spec).year);
    const off = songYearError(v, year);
    const ex = ctx.prev?.extra ?? {};
    return {
      input: { value: v, elapsedMs: elapsed === null ? null : Math.round(elapsed), ...(ex.fail ? { fail: true } : {}) },
      value: off,
      error: v - year,
      elapsedMs: elapsed,
      submitted: true,
      extra: { ...ex, guess: v, off },
      provisional: true,
      feedback: { result: 'set', value: v },
    };
  },
  earlyEnd(spec, subs, connected) {
    return failEarly(spec, subs, connected);
  },
  finalizeRound(spec, subs) {
    const sk = skippedFinal(spec, subs);
    if (sk) return sk;
    const values = new Map<string, { value: number | null; extra?: Record<string, unknown> }>();
    for (const [a, s] of subs) values.set(a, { value: s.extra?.guess !== undefined ? s.value : null });
    return { values, reveal: spec.reveal };
  },
};
