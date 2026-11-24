// =============================================================================
// ★★★ R116 (D-373 · docs/24 3절) — 공방: 방 종류 · 정원 · 잠금 · 목록 줄 · 정렬 · 빠른 입장 고르기
//
//   ★ 순수 함수만 둔다(서버 · 화면 · 봇이 같이 쓴다). 상태(구독 · 틀린 횟수)는 server/src/gongbang/ 에.
//   ★ 스위치 GONGBANG 이 꺼져 있으면 서버는 이 파일의 어떤 값도 방에 적용하지 않는다(오늘과 같다).
// =============================================================================

import type { RoomMode } from './liar.js';
import type { DifficultyLevel } from './settings.js';
import { MINIGAMES, minigameSelectable, type MinigameKey } from './minigame.js';

/** 방 종류(목록 탭 · 색 · 아이콘) — settings.mode 에서 계산한다(새 갈래를 만들지 않는다 · docs/24 3-1) */
export type RoomKind = 'quiz' | 'draw' | 'liar';
export const ROOM_KINDS: readonly RoomKind[] = ['quiz', 'draw', 'liar'];

export function roomKindOf(mode: RoomMode): RoomKind {
  if (mode === 'draw') return 'draw';
  if (mode === 'liar') return 'liar';
  return 'quiz'; // quiz · minigame(미니게임만) · song(베타만)
}

/** 종류를 처음 고를 때의 방식 */
export function modeOfKind(kind: RoomKind): RoomMode {
  return kind;
}

export function isRoomKind(v: unknown): v is RoomKind {
  return v === 'quiz' || v === 'draw' || v === 'liar';
}

export const GONGBANG = {
  /** 정원 위 끝(RULES.MAX_PLAYERS 와 같다) · 기본(찬종 2026-11-24 ⑦) */
  MAX_PLAYERS: 10,
  DEFAULT_MAX_PLAYERS: 8,
  /** 비밀번호 = 숫자 4자리(찬종 ①) */
  PASSWORD_RE: /^\d{4}$/,
  /** 한 방에 한 계정이 이만큼 틀리면 LOCK_MS 동안 그 방에 비밀번호를 못 넣는다 */
  PASSWORD_FAIL_MAX: 5,
  PASSWORD_LOCK_MS: 10 * 60_000,
  /** 여러 방을 돌며 찍기 — 계정당 1분에 이만큼 */
  PASSWORD_TRY_PER_MIN: 10,
  /** 탭 하나에 보내는 줄 수 */
  LIST_MAX: 100,
  /** 목록을 다시 만들어 보내는 간격(바뀐 것이 있을 때만) */
  LIST_INTERVAL_MS: 1_000,
  /** 빠른 입장 — 진행 중인 방은 남은 진행이 이 비율을 넘어야 앞쪽 후보 */
  QUICK_PLAYING_REMAIN: 0.3,
  /** 빠른 입장 — 같은 차례 안에서 정원의 이 비율까지 찬 방을 먼저 */
  QUICK_CROWD_RATIO: 0.8,
} as const;

/** 종류별 정원 아래 끝 — 라이어는 3명부터 시작한다(LIAR.MIN_PLAYERS) */
export function minPlayersOf(kind: RoomKind): number {
  return kind === 'liar' ? 3 : 2;
}

export function clampMaxPlayers(kind: RoomKind, n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < minPlayersOf(kind) || n > GONGBANG.MAX_PLAYERS) return null;
  return n;
}

export function isRoomPassword(v: unknown): v is string {
  return typeof v === 'string' && GONGBANG.PASSWORD_RE.test(v);
}

/** 공방 퀴즈 방의 미니게임 기본 목록 — 퀴즈형이고 고를 수 있는 것(찬종 ⑧ · docs/24 7절) */
export function quizMinigameKeys(): MinigameKey[] {
  return MINIGAMES.filter((m) => m.kind === 'quiz' && minigameSelectable(m.key)).map((m) => m.key);
}

// ─────────────────────────────────────────────────────────────────────────────
// 목록 줄 (docs/24 3-6 · 찬종 R115 — 방장 이름 · 띠는 싣지 않는다)
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomListItem {
  /** 6자리 코드 = 입장 열쇠(긴 id 는 싣지 않는다 — 초대 링크만 비밀번호를 건너뛴다) */
  code: string;
  title: string;
  kind: RoomKind;
  /** 퀴즈 탭 안의 표시 — 미니게임만 · 노래 */
  tag: null | 'minigame' | 'song';
  players: number;
  max: number;
  locked: boolean;
  phase: 'waiting' | 'playing';
  /** 일시정지(목록에는 진행 중으로 보이되 빠른 입장에서 뺀다) */
  paused: boolean;
  /** 퀴즈 = 몇 번째 문제/문제 수 · 미니게임만 = 끝난 수/전체 · 캐치 · 라이어 = 몇 판/전체 · 대기 중이면 null */
  progress: { done: number; total: number } | null;
  /** 퀴즈 방의 미니게임 포함 */
  minigames: boolean;
  /** 퀴즈 방의 난이도(캐치 · 라이어 = null) */
  level: DifficultyLevel | null;
}

export function canEnter(item: RoomListItem): boolean {
  return !item.locked && item.players < item.max;
}

function remainRatio(item: RoomListItem): number {
  if (!item.progress || item.progress.total <= 0) return 1;
  return Math.max(0, 1 - item.progress.done / item.progress.total);
}

/**
 * 목록 정렬(찬종 ④ — 들어갈 수 있는 방 먼저): ① 안 잠김 · 자리 남음 ② 대기 중 ③ 사람 많은 순 ④ 새 방 순.
 *   잠긴 방 · 꽉 찬 방 · 진행이 거의 끝난 방은 아래로. createdAt 은 서버만 알아 두 번째 인자로 받는다.
 */
export function sortRoomList<T extends RoomListItem>(items: readonly T[], createdAt: (it: T) => number = () => 0): T[] {
  const band = (it: RoomListItem): number => {
    if (!canEnter(it)) return 3;
    if (it.phase === 'playing' && remainRatio(it) <= GONGBANG.QUICK_PLAYING_REMAIN) return 2;
    return it.phase === 'waiting' ? 0 : 1;
  };
  return [...items].sort((a, b) => band(a) - band(b) || b.players - a.players || createdAt(b) - createdAt(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// 빠른 입장 (docs/24 3-7)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuickJoinOpts {
  /** 고른 난이도들(비우면 상관없음) — 퀴즈 탭에서만 뜻이 있다 */
  levels: DifficultyLevel[];
  minigame: 'any' | 'with' | 'without';
  size: 'any' | 'small' | 'big';
  waitingOnly: boolean;
}

export const DEFAULT_QUICK_JOIN_OPTS: QuickJoinOpts = { levels: [], minigame: 'any', size: 'any', waitingOnly: false };

const LEVELS: readonly DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

/** 화면이 보낸 옵션을 고른다(모르는 값은 기본으로) */
export function parseQuickJoinOpts(raw: unknown): QuickJoinOpts {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const levels = Array.isArray(o.levels) ? [...new Set(o.levels.filter((l): l is DifficultyLevel => LEVELS.includes(l as DifficultyLevel)))] : [];
  return {
    levels: levels.length === LEVELS.length ? [] : levels,
    minigame: o.minigame === 'with' || o.minigame === 'without' ? o.minigame : 'any',
    size: o.size === 'small' || o.size === 'big' ? o.size : 'any',
    waitingOnly: o.waitingOnly === true,
  };
}

/** 옵션 중 "상관없음"이 아닌 칸 수(버튼에 "옵션 2") */
export function quickJoinOptCount(o: QuickJoinOpts): number {
  return (o.levels.length ? 1 : 0) + (o.minigame !== 'any' ? 1 : 0) + (o.size !== 'any' ? 1 : 0) + (o.waitingOnly ? 1 : 0);
}

/** 덜 중요한 것부터 버린다 — 인원 → 대기 중인 방만 → 미니게임 → 난이도(찬종 R115 · docs/24 3-7) */
export type QuickJoinField = 'size' | 'waiting' | 'minigame' | 'level';
export const QUICK_JOIN_WEIGHT: Record<QuickJoinField, number> = { size: 1, waiting: 2, minigame: 4, level: 8 };
/** 인원 — 적은 방 = 지금 4명 이하 · 북적이는 방 = 5명 이상 */
export const QUICK_SMALL_MAX = 4;

export function quickJoinMismatch(item: RoomListItem, o: QuickJoinOpts): QuickJoinField[] {
  const out: QuickJoinField[] = [];
  if (o.size === 'small' && item.players > QUICK_SMALL_MAX) out.push('size');
  if (o.size === 'big' && item.players <= QUICK_SMALL_MAX) out.push('size');
  if (o.waitingOnly && item.phase !== 'waiting') out.push('waiting');
  if (item.kind === 'quiz') {
    if (o.minigame === 'with' && !item.minigames) out.push('minigame');
    if (o.minigame === 'without' && item.minigames) out.push('minigame');
    if (o.levels.length && (!item.level || !o.levels.includes(item.level))) out.push('level');
  }
  return out;
}

const weightOf = (fields: readonly QuickJoinField[]): number => fields.reduce((a, f) => a + QUICK_JOIN_WEIGHT[f], 0);

/** 3-7 의 차례 — 0 대기 중 2명 이상 · 1 대기 중 1명 · 2 진행 중 퀴즈 · 캐치(남은 진행 30% 넘음) · 3 진행 중 라이어 · 4 거의 끝난 방 */
export function quickJoinTier(item: RoomListItem): number {
  if (item.phase === 'waiting') return item.players >= 2 ? 0 : 1;
  if (item.kind === 'liar') return 3;
  return remainRatio(item) > GONGBANG.QUICK_PLAYING_REMAIN ? 2 : 4;
}

/** 같은 차례 안 — 정원의 80% 까지 찬 방을 사람 많은 순으로, 그 위로 찬 방은 뒤에 */
function crowdKey(item: RoomListItem): number {
  const over = item.players > item.max * GONGBANG.QUICK_CROWD_RATIO;
  return (over ? 100 : 0) - item.players;
}

export interface QuickJoinPick<T extends RoomListItem = RoomListItem> {
  item: T;
  /** 비어 있으면 딱 맞는 방 — 바로 들어간다 · 있으면 화면이 "가장 비슷한 방" 창을 띄운다 */
  mismatch: QuickJoinField[];
}

/**
 * 빠른 입장 후보를 차례대로 — 늘 지키는 것(같은 자리 · 같은 종류 · 차단 안 됨은 서버가 미리 거른다) + 안 잠김 · 자리 남음 · 일시정지 아님.
 *   ① 어긋난 칸 무게 합이 작은 방 ② 3-7 차례 ③ 적당히 찬 방. 서버는 앞에서부터 들어가 보고, 그 사이 꽉 찼으면 다음 후보(2번까지 더).
 */
export function rankQuickJoin<T extends RoomListItem>(items: readonly T[], o: QuickJoinOpts): QuickJoinPick<T>[] {
  return items
    .filter((it) => canEnter(it) && !it.paused)
    .map((item) => ({ item, mismatch: quickJoinMismatch(item, o) }))
    .sort((a, b) => weightOf(a.mismatch) - weightOf(b.mismatch) || quickJoinTier(a.item) - quickJoinTier(b.item) || crowdKey(a.item) - crowdKey(b.item));
}

export function pickQuickJoin<T extends RoomListItem>(items: readonly T[], o: QuickJoinOpts): QuickJoinPick<T> | null {
  return rankQuickJoin(items, o)[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 금칙어 — 방 제목 · 닉네임(목록에 그대로 드러난다 · docs/24 3-8). 채팅은 거르지 않는다(찬종 "도배도 재미").
//   ★ 띄어쓰기 · 기호 · 숫자를 끼워 넣은 꼴도 잡도록 한글 · 영문만 남겨 견준다. 목록은 "좋음" 등급 — 흔한 욕 · 성적 표현만.
//   ★ 흔한 낱말 속에 들어가는 두 글자(보지마 · 자지러지다 · 새끼손가락 · 시발점)는 넣지 않았다 — 오탐이 더 나쁘다.
// ─────────────────────────────────────────────────────────────────────────────
const BANNED_WORDS = [
  '씨발', '씨바', '씨팔', '시팔', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '븅신', '좆', '좃같', '개새끼', '개새기', '개색', '지랄', 'ㅈㄹ',
  '느금', '니애미', '느개비', '애비뒤', '엠창', '창녀', '섹스', '야동', '미친년', '미친놈', '썅',
  'fuck', 'shit', 'bitch', 'sex', 'porn', 'nigger',
];
export function bannedWordOf(text: string): string | null {
  const flat = text.normalize('NFC').toLowerCase().replace(/[^a-z가-힣ㄱ-ㅎ]/g, '');
  return BANNED_WORDS.find((w) => flat.includes(w)) ?? null;
}
