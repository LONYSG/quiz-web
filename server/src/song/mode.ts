// =============================================================================
// ★★★ R096 — 노래 맞히기 방식(D-353 · shared/src/songMode.ts · 찬종 #117) — 서버 쪽
//
// ★ 판 흐름은 퀴즈 그대로(game/question.ts beginQuestion → resolveQuestionSync → advanceAfterResolved) — 이 파일은 그 안의
//   "문항 = 곡" 부분만: 곡 풀(적재본 minigame_items 'song' · 방 설정 범위) · 다음 곡 고르기(경험 없는 곡 먼저 · 이 판 중복 0) ·
//   CurrentQuestion.song 만들기 · 기록(minigame_runs 'song' 재사용 — 마이그레이션 없음 · ★ R099 평가 입력 없앰 — 옛 평가는 minigame_results.input.rate).
// ★ 판정 = 제목만(title · titleVariants · trackName — songMatcher 의 'title' 열쇠) · 가수 = 본인 알림(socket chat.send).
// ★ 경험 = minigame_item_experiences('song', id) — 미니게임 노래 맞히기와 같은 키 'song|<id>'(어느 쪽으로 들었어도 들은 곡).
// ★ 퀴즈 표(game_questions · answer_events · question_experiences · near_misses · question_feedback)는 questions(id) FK 라 쓰지 않는다.
// =============================================================================

import { randomInt } from 'node:crypto';
import {
  flexAnswerSet,
  normalizeAnswer,
  songChips,
  songCover600,
  songInitials,
  songInRange,
  songMatcher,
  type SongSettings,
} from '@quiz/shared';
import { loadQuizData, type QuizItem } from '../db/minigameItems.js';
import { insertResults, insertRound, insertRun, insertRunPlayers, finishRun, recordItemExperiences } from '../db/minigames.js';
import { query } from '../db/pool.js';

/** 판 안 곡 하나(메모리 — 판정 · 공개에 필요한 것 전부) */
export interface SongEntry {
  id: string;
  title: string;
  artist: string;
  year: number;
  category: string;
  genre: string | null;
  legend: boolean;
  titleKo: string;
  previewUrl: string;
  cover: string | null;
  /** 제목 변형 원문(마스킹 · 정답 집합) */
  titleRaw: string[];
  /** 가수 변형 원문("가수 말고 제목을" 알림만 — 점수 없음) */
  artistRaw: string[];
}

export interface SongRun {
  pool: SongEntry[];
  used: Set<string>;
  /** minigame_runs.id(기록 — 만들지 못하면 null · 판은 그대로 간다) */
  runId: string | null;
  /** 곡 순번(1부터) → 곡 id — 평가 저장(round_index) */
  rounds: Map<number, string>;
}

/** 공개 · 결과에 실을 곡 정보(정답 공개 뒤에만 화면에 간다) */
export interface SongRevealInfo {
  id: string;
  title: string;
  artist: string;
  year: number;
  chips: string[];
  cover: string | null;
}

/** CurrentQuestion.song — 판 중 화면에 가는 것은 previewUrl · cover · durationMs 뿐(제목 · 가수는 공개 뒤) */
export interface SongQuestion {
  entry: SongEntry;
  matcher: Map<string, string>;
  durationMs: number;
  /** 재생 실패를 보고한 사람(접속자 과반이면 그 곡을 넘긴다 — R092 규칙 그대로) */
  fails?: Set<string>;
  failSkipped?: boolean;
  /** 맞힌 시간(곡 시작 → 정답 · 공개 줄 "n초 만에") */
  winnerMs?: number | null;
}

/** 공개 줄(곡 + 맞힌 시간 + 실패로 넘김) — question.resolved · 스냅샷이 같이 쓴다 */
export function songResolvedView(q: SongQuestion): SongRevealInfo & { winnerMs: number | null; failSkipped: boolean } {
  return { ...songRevealOf(q.entry), winnerMs: q.winnerMs ?? null, failSkipped: q.failSkipped === true };
}

/** 재생 실패 보고 하나 → 넘길 차례인가(접속자 과반 · 같은 사람 한 번) */
export function noteSongFail(q: SongQuestion, accountId: string, connected: number): boolean {
  (q.fails ??= new Set()).add(accountId);
  return connected > 0 && q.fails.size * 2 > connected;
}

interface Payload {
  title?: string;
  titleVariants?: string[];
  artist?: string;
  artistVariants?: string[];
  year?: number;
  category?: string;
  genre?: string | null;
  legend?: boolean;
  titleKo?: string;
  itunes?: { trackId?: number; previewUrl?: string; artworkUrl100?: string; trackName?: string; artistName?: string };
}

export function songEntryOf(it: Pick<QuizItem, 'id' | 'payload'>): SongEntry | null {
  const p = it.payload as Payload;
  const url = p.itunes?.previewUrl;
  // ★ 연습 곡(SONG_DUMMY) trackId 규칙은 미니게임 연습 판 몫 — 방식 판에는 연습이 없어 그 두 곡(쏘리 쏘리 · Uptown Funk)도 낸다
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  if (typeof p.title !== 'string' || typeof p.artist !== 'string' || !Number.isInteger(p.year)) return null;
  return {
    id: it.id,
    title: p.title,
    artist: p.artist,
    year: p.year!,
    category: p.category ?? '',
    genre: p.genre ?? null,
    legend: p.legend === true,
    titleKo: p.titleKo ?? p.title,
    previewUrl: url,
    cover: songCover600(p.itunes?.artworkUrl100),
    titleRaw: [...new Set([p.title, ...(p.titleVariants ?? []), ...(p.itunes?.trackName ? [p.itunes.trackName] : [])])],
    artistRaw: [...new Set([...(p.artistVariants ?? []), ...(p.itunes?.artistName ? [p.itunes.artistName] : [])])],
  };
}

/** ★ 방 설정 범위 안 곡(적재본 활성 · 미리듣기 있음) */
export function songPoolFrom(items: readonly Pick<QuizItem, 'id' | 'payload'>[], s: SongSettings): SongEntry[] {
  const out: SongEntry[] = [];
  for (const it of items) {
    const e = songEntryOf(it);
    if (e && songInRange({ category: e.category, genre: e.genre, year: e.year, legend: e.legend }, s)) out.push(e);
  }
  return out;
}

export async function loadSongPool(s: SongSettings): Promise<SongEntry[]> {
  const data = await loadQuizData();
  return songPoolFrom(data.items.song ?? [], s);
}

/** 로비 칩 수용 — 활성 곡 전체의 고르기 칸 */
export async function loadSongMetas(): Promise<{ category: string; genre: string | null; year: number; legend: boolean }[]> {
  const data = await loadQuizData();
  return (data.items.song ?? []).map((it) => songEntryOf(it)).filter((e): e is SongEntry => !!e).map((e) => ({ category: e.category, genre: e.genre, year: e.year, legend: e.legend }));
}

/**
 * ★ 다음 곡 — 이 판에서 안 쓴 곡 중 **들은 사람이 적은 곡 먼저**(경험 'song|<id>' · 'songyear|<id>' 어느 쪽이든) · 같으면 무작위.
 *   @returns 곡과 그 곡을 들은 참가자(경험자 — 판정 제외 · 마스킹 · 배지 · 퀴즈 규칙 그대로)
 */
export function pickNextSong(
  run: SongRun,
  participants: readonly string[],
  experienced: ReadonlyMap<string, ReadonlySet<string>>,
  rnd: (n: number) => number = randomInt,
): { entry: SongEntry; experiencedBy: Set<string> } | null {
  const free = run.pool.filter((e) => !run.used.has(e.id));
  if (!free.length) return null;
  const heardBy = (id: string) => participants.filter((a) => experienced.get(a)?.has(`song|${id}`) || experienced.get(a)?.has(`songyear|${id}`));
  let best: SongEntry[] = [];
  let min = Infinity;
  for (const e of free) {
    const n = heardBy(e.id).length;
    if (n < min) {
      min = n;
      best = [e];
    } else if (n === min) best.push(e);
  }
  const entry = best[rnd(best.length)]!;
  return { entry, experiencedBy: new Set(heardBy(entry.id)) };
}

/** 판정 · 마스킹 재료(퀴즈 CurrentQuestion 칸 꼴) */
export function songAnswerSets(e: SongEntry): { answersNorm: Set<string>; answersFlex: Set<string>; answersRaw: string[]; hint: string | null; matcher: Map<string, string> } {
  const matcher = songMatcher({ title: e.title, titleVariants: e.titleRaw, artist: e.artist, artistVariants: e.artistRaw });
  const answersNorm = new Set(e.titleRaw.map((t) => normalizeAnswer(t)).filter((x) => x.length > 0));
  return { answersNorm, answersFlex: flexAnswerSet(e.titleRaw, answersNorm), answersRaw: e.titleRaw, hint: songInitials(e.titleKo), matcher };
}

export function songRevealOf(e: SongEntry): SongRevealInfo {
  return { id: e.id, title: e.title, artist: e.artist, year: e.year, chips: songChips({ category: e.category, genre: e.genre, year: e.year, legend: e.legend }), cover: e.cover };
}

// ─────────────────────────────────────────────────────────────────────────────
// 기록 — 전부 fire-and-forget(판은 기다리지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
function fire(label: string, p: Promise<unknown>): void {
  void p.catch((err) => console.error(`[song] ★ ${label} 기록 실패:`, (err as Error).message));
}

/** 판 시작 — minigame_runs('song' · 연습 아님 · 방식 판) + 참가자 */
export async function openSongRun(gameId: string | null, roomId: string, players: readonly { accountId: string; device: string | null; colorIndex: number }[]): Promise<string | null> {
  try {
    const runId = await insertRun({ gameId, roomId, key: 'song', practice: false, afterQuestionIndex: null, seed: randomInt(2 ** 31) });
    await insertRunPlayers(runId, players);
    return runId;
  } catch (err) {
    console.error('[song] ★ 판 기록 실패(판은 그대로 간다):', (err as Error).message);
    return null;
  }
}

/** 곡 하나 끝(공개) — round · 맞힌 사람 결과 · 경험(공개 순간 접속자) */
export function recordSongResolved(run: SongRun, index: number, e: SongEntry, winner: string | null, ms: number | null, witnesses: readonly string[], reason: string): void {
  const runId = run.runId;
  if (!runId) return;
  fire('round', insertRound(runId, index, e.id, { mode: 'song', reason, category: e.category, genre: e.genre, year: e.year }, 0, e.id).then(() =>
    winner ? insertResults(runId, index, [{ accountId: winner, submitted: true, input: null, value: 1, error: null, elapsedMs: ms, rank: 1, points: 1 }]) : undefined,
  ));
  fire('경험', recordItemExperiences(witnesses, 'song', e.id, runId));
}

/** 판 끝 — 최종 순위 */
export function closeSongRun(run: SongRun, reason: 'completed' | 'force_ended' | 'abandoned', finals: readonly { accountId: string; rank: number; total: number }[]): void {
  if (!run.runId) return;
  fire('판 끝', finishRun(run.runId, reason, finals.map((f) => ({ ...f, reward: 0 }))));
}

