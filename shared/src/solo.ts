// =============================================================================
// ★★★ R118 (docs/24 4절 솔로 · 5절 띠) — 혼자 하기(서바이벌) · 띠: 상수 · 순수 함수 · 이벤트 꼴
//
//   ★ 순수 함수만 둔다(서버 · 화면 · 봇이 같이 쓴다). 판 상태 · DB 는 server/src/solo/.
//   ★ 스위치 SOLO(혼자 하기) · BELT(띠 · 띠 포인트)가 꺼져 있으면 서버는 이 파일의 값을 쓰지 않는다(오늘과 같다).
//   ★ 표를 바꾸면 버전 번호를 올린다 — 기록(solo_runs.ramp_version · belt_version)에 같이 남아 옛 기록을 가른다.
// =============================================================================

import type { SoloSure } from './soloSure.js';

export const SOLO = {
  /** 목숨(찬종 · 4절) */
  LIVES: 3,
  /**
   * ★★ R123 (찬종 "템포가 너무 빨라서 지친다 · 숨 고르기") — 문제마다(맞힘 · 시간 끝 · 넘기기) 정답 + 해설을 보여 준 뒤
   *   점 셋 카운트(영상의 nextCount 와 같다 — 1초에 하나 · 3초)로 다음 문제. 옛 NEXT_AFTER_OK_MS 800 · NEXT_AFTER_FAIL_MS 1500 은 이 흐름으로 바뀌었다.
   *   해설 보여 주는 시간 = 글자 수로(soloExplainMs) · 그 사이 Enter(모바일 탭)로 바로 카운트로.
   */
  COUNT_MS: 3_000,
  EXPLAIN_CHARS_PER_SEC: 12,
  EXPLAIN_MIN_MS: 4_000,
  EXPLAIN_MAX_MS: 12_000,
  /** ★ R123 (찬종 고름) — 정답이 띄어쓰기 빼고 이 글자 수를 넘는 문제는 솔로 풀에서 뺀다 */
  ANSWER_MAX_CHARS: 6,
  /**
   * ★★ R124 (찬종 "처음 게임 시작할 때 카운트다운 후에 시작되도록") — [시작]을 누르면 곧바로 3 · 2 · 1 → 첫 문제.
   *   판 준비(아이템 값 · 판 기록 · 문제 고르기)는 이 사이에 돈다 · 첫 문제 시간은 문제가 나간 때부터 센다(카운트다운에 안 깎인다).
   */
  START_COUNT_MS: 3_000,
  /** ★★ R124 (찬종 "솔로하기에서 이모지 문제는 나오지 않게") — 질문에 이모지 그림이 이만큼 이상이면 이모지 문제(솔로 풀에서 뺀다) */
  EMOJI_QUESTION_MIN: 2,
  /** 마감 뒤 통신 여유 — 도착이 마감 + 이만큼을 넘으면 무효(4-5) */
  GRACE_MS: 300,
  /** 끊긴 채 이만큼 지나면 그때까지 기록으로 끝(4-5 · 4-7) — 문제 시계는 그동안에도 간다 */
  RECONNECT_MS: 30_000,
  /** 내가 최근 솔로에서 본 문항 이만큼은 뒤로 미룬다(4-3) */
  RECENT_SKIP: 200,
  /** 판 시작 한도 — 계정당 1시간(4-5 문제 은행 막기) */
  RUNS_PER_HOUR: 30,
  /** 사람보다 빠른 답(의심 표시 — 띠는 자동으로 안 뺏는다 · 4-5) */
  FAST_MS: 600,
  /** 답 한 번의 최대 글자 · 문제 하나에 남기는 틀린 답 수 · 틀린 답 글 길이(12-2 — 20자까지) */
  ANSWER_MAX_LEN: 100,
  WRONG_KEEP: 5,
  WRONG_TEXT_MAX: 20,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 시간 — 4-4(찬종 2026-11-24 ②): 8초 + 질문이 30자를 넘는 10자마다 0.5초 + 정답이 5자를 넘는 글자마다 0.4초 · 8~13초 · 기기와 무관
// ─────────────────────────────────────────────────────────────────────────────

export interface SoloTimeParams {
  baseMs: number;
  /** 질문 기준 글자 · 그 위 10자마다 */
  textFree: number;
  perTenTextMs: number;
  /** 정답 기준 글자 · 그 위 한 글자마다 */
  answerFree: number;
  perAnswerCharMs: number;
  minMs: number;
  maxMs: number;
}
export const SOLO_TIME: SoloTimeParams = {
  baseMs: 8_000,
  textFree: 30,
  perTenTextMs: 500,
  answerFree: 5,
  perAnswerCharMs: 400,
  minMs: 8_000,
  maxMs: 13_000,
};

/** 글자 수 — 띄어쓰기를 빼고 센다(정답 "세종 대왕" = 4자) · 질문은 띄어쓰기도 읽는 글자라 그대로 */
const charLen = (s: string) => [...s].length;

/**
 * 문제 하나의 시간(ms · 100ms 단위로 반올림). 54자 · 정답 4자 ≈ 9.2초 · 69자 · 9자 ≈ 11.6초(문서 4-4 의 ≈9 · ≈11.5).
 *   ★ 10자마다를 끊지 않고 이어서 센다(54자 = 2.4 × 0.5초) — 문서의 예 두 개가 이어서 센 값이다.
 */
export function soloTimeMs(text: string, answer: string, p: SoloTimeParams = SOLO_TIME): number {
  const over = Math.max(0, charLen(text.trim()) - p.textFree);
  const ans = Math.max(0, charLen(answer.replace(/\s+/g, '')) - p.answerFree);
  const raw = p.baseMs + (over / 10) * p.perTenTextMs + ans * p.perAnswerCharMs;
  return Math.round(Math.min(p.maxMs, Math.max(p.minMs, raw)) / 100) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// 어려움 — 4-3 표(SOLO_RAMP) · 알가치 1 뺌 · 그 등급이 모자라면 아래 등급에서
// ─────────────────────────────────────────────────────────────────────────────

export const SOLO_RAMP_VERSION = 1;
/** 지금까지 맞힌 개수(from 이상) → 등급 [등급, 무게] */
export const SOLO_RAMP: readonly { from: number; grades: readonly (readonly [number, number])[] }[] = [
  { from: 0, grades: [[1, 1]] },
  { from: 5, grades: [[1, 1], [2, 1]] },
  { from: 10, grades: [[2, 1]] },
  { from: 15, grades: [[2, 1], [3, 1]] },
  { from: 20, grades: [[3, 1]] },
  { from: 30, grades: [[3, 1], [4, 1]] },
  { from: 40, grades: [[4, 1]] },
  { from: 50, grades: [[4, 7], [5, 3]] },
  { from: 60, grades: [[4, 1], [5, 1]] },
];

/** 맞힌 개수 → 이번 문제의 등급(random = 0~1) */
export function soloGradeFor(correct: number, random: number = Math.random()): number {
  let row = SOLO_RAMP[0]!;
  for (const r of SOLO_RAMP) if (correct >= r.from) row = r;
  const total = row.grades.reduce((s, [, w]) => s + w, 0);
  let x = Math.min(0.999999, Math.max(0, random)) * total;
  for (const [g, w] of row.grades) {
    if (x < w) return g;
    x -= w;
  }
  return row.grades[row.grades.length - 1]![0];
}

/** 그 등급에 낼 문제가 없을 때 찾는 차례 — 아래 먼저(지금 gradeOrder 와 같은 "아래 먼저"), 그래도 없으면 위 */
export function soloGradeOrder(grade: number): number[] {
  const out = [grade];
  for (let g = grade - 1; g >= 1; g -= 1) out.push(g);
  for (let g = grade + 1; g <= 5; g += 1) out.push(g);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 띠 — 5-1 안 A(찬종 채택) · 25칸(belt_step 0~24 · 띠 = 5로 나눈 몫 · 단계 = 나머지) · 받은 띠는 안 내려간다(5-3)
// ─────────────────────────────────────────────────────────────────────────────

export const BELT_VERSION = 1;
export type BeltColor = 'white' | 'blue' | 'purple' | 'brown' | 'black';
export const BELT_COLORS: readonly BeltColor[] = ['white', 'blue', 'purple', 'brown', 'black'];
export const BELT_NAMES: Record<BeltColor, string> = { white: '화이트벨트', blue: '블루벨트', purple: '퍼플벨트', brown: '브라운벨트', black: '블랙벨트' };
/** ★ R123 (찬종 고름 "I→V 오르는 방향") — 띠마다 5칸을 I~V 로(칸 번호 · 기준 · 포인트는 그대로 · 보이는 숫자만 step % 5 + 1) */
export const BELT_ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** 칸마다 "그 칸이 시작되는 최고 기록"(칸 0 = 첫 판을 끝냄 · 0개여도) */
export const BELT_STARTS: readonly number[] = [
  0, 3, 6, 9, 12, // 화이트
  15, 18, 21, 24, 27, // 블루
  30, 32, 34, 36, 38, // 퍼플
  40, 42, 44, 46, 48, // 브라운
  50, 55, 60, 70, 80, // 블랙
];
/** 5-5 P2(찬종 채택) — 그 칸까지 받는 누적 포인트(첫 판 10 · 단계 +5 · 새 띠 +40) */
export const BELT_POINTS: readonly number[] = [
  10, 15, 20, 25, 30,
  70, 75, 80, 85, 90,
  130, 135, 140, 145, 150,
  190, 195, 200, 205, 210,
  250, 255, 260, 265, 270,
];
export const BELT_MAX_STEP = BELT_STARTS.length - 1;

export function isBeltStep(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= BELT_MAX_STEP;
}

/** 최고 기록 → 칸(판을 한 번이라도 끝낸 사람 — 0개여도 화이트 0) */
export function beltStepForBest(best: number): number {
  let step = 0;
  for (let i = 0; i < BELT_STARTS.length; i += 1) if (best >= BELT_STARTS[i]!) step = i;
  return step;
}

/** 판이 끝났을 때의 새 칸 — 지금 칸(null = 띠 없음)보다 내려가지 않는다(5-3) */
export function nextBeltStep(current: number | null, best: number): number {
  const s = beltStepForBest(best);
  return current === null ? s : Math.max(current, s);
}

/** 오를 때 줄 포인트 — 새 칸 누적 − 지금까지 받은 띠 포인트(0 아래면 0 · 거두지 않는다 · 5-5) */
export function beltPointsDue(step: number, alreadyGranted: number): number {
  const target = BELT_POINTS[Math.max(0, Math.min(BELT_MAX_STEP, step))]!;
  return Math.max(0, target - Math.max(0, alreadyGranted));
}

export function beltColorOf(step: number): BeltColor {
  return BELT_COLORS[Math.max(0, Math.min(4, Math.floor(step / 5)))]!;
}
export function beltDegreeOf(step: number): number {
  return Math.max(0, step) % 5;
}
/** "블루벨트 I" ~ "블루벨트 V" · null = "띠 없음" — ★ R123 첫 칸도 숫자(I) */
export function beltLabel(step: number | null): string {
  if (step === null || !isBeltStep(step)) return '띠 없음';
  return `${BELT_NAMES[beltColorOf(step)]} ${BELT_ROMAN[beltDegreeOf(step)]}`;
}
/** 다음 칸까지 더 맞혀야 할 개수(최고 기록 기준) · 끝 칸이면 null */
export function beltNextNeed(step: number | null, best: number): { step: number; need: number } | null {
  const next = step === null ? 0 : step + 1;
  if (next > BELT_MAX_STEP) return null;
  return { step: next, need: Math.max(next === 0 ? 0 : 1, BELT_STARTS[next]! - best) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 이벤트 꼴(서버 → 화면) — docs/24 4-2 · 15절
// ─────────────────────────────────────────────────────────────────────────────

export type SoloEndReason = 'lives' | 'quit' | 'away' | 'disconnect' | 'server_restart' | 'no_questions';
/** ★ R123 — skip = 넘기기 아이템(목숨 안 깎음 · 맞힌 수에 안 셈 · 정답 + 해설은 보여 줌) */
export type SoloQuestionEnd = 'correct' | 'timeout' | 'away' | 'skip';

/** ★★ R123 — 해설 보여 주는 시간(정답 + 해설 글자 수 · 12자/초 · 4~12초) */
export function soloExplainMs(answer: string, explanation: string | null): number {
  const n = [...`${answer}${explanation ?? ''}`.replace(/\s+/g, '')].length;
  const ms = (n / SOLO.EXPLAIN_CHARS_PER_SEC) * 1000;
  return Math.round(Math.min(SOLO.EXPLAIN_MAX_MS, Math.max(SOLO.EXPLAIN_MIN_MS, ms)) / 100) * 100;
}

/** ★ R123 — 솔로 풀에 넣는 정답인가(띄어쓰기 빼고 ANSWER_MAX_CHARS 이하) */
export function soloAnswerFits(displayAnswer: string): boolean {
  return [...displayAnswer.replace(/\s+/g, '')].length <= SOLO.ANSWER_MAX_CHARS;
}

/**
 * ★★ R124 — 이모지 문제인가(질문이 이모지 그림으로 된 문제 · 솔로 풀에서 뺀다).
 *   가르는 기준 = 질문 속 **그림으로 그려지는 이모지 글자 묶음** 수(Emoji_Presentation · 이모지 꼴 표시 U+FE0F · 국기 조각) ≥ EMOJI_QUESTION_MIN.
 *   ♯ · ♂ · ♀ 같은 글자 꼴 기호(Extended_Pictographic 이지만 그림 표시가 아님)는 세지 않는다 —
 *   실 DB 2026-11-28: 이 기준 1,207문항 = 질문에 "이모지"가 든 문항 1,207 과 같다(그 밖 0 · 기호 든 일반 문항 2개는 0개로 셈).
 */
const EMOJI_PRESENT_RE = /\p{Emoji_Presentation}|\uFE0F|\p{Regional_Indicator}/u;
let emojiSeg: Intl.Segmenter | null = null;
export function isEmojiQuestion(text: string): boolean {
  if (!EMOJI_PRESENT_RE.test(text)) return false;
  emojiSeg ??= new Intl.Segmenter('und', { granularity: 'grapheme' });
  let n = 0;
  for (const { segment } of emojiSeg.segment(text)) {
    if (EMOJI_PRESENT_RE.test(segment) && ++n >= SOLO.EMOJI_QUESTION_MIN) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★ R123 — 아이템(찬종 2026-11-27): 힌트 5P · 초성 10P · 넘기기 30P · 판마다 시작 전에 0~3개씩
//   시작할 때 고른 만큼 차감(point_spends 'solo-item' 한 줄) · 안 쓰고 남은 것은 판이 끝나면 돌려준다.
//   한 문제에 힌트 · 초성 각 1번까지 · 해설 · 카운트 동안엔 못 씀 · 단축키 Alt+1 · Alt+2 · Alt+3.
// ─────────────────────────────────────────────────────────────────────────────

export type SoloItemKind = 'hint' | 'initial' | 'skip';
export const SOLO_ITEMS: readonly { kind: SoloItemKind; label: string; price: number; key: string }[] = [
  { kind: 'hint', label: '힌트', price: 5, key: '1' },
  { kind: 'initial', label: '초성', price: 10, key: '2' },
  { kind: 'skip', label: '넘기기', price: 30, key: '3' },
];
export const SOLO_ITEM_MAX = 3;
export type SoloItemCounts = Record<SoloItemKind, number>;
export const NO_SOLO_ITEMS: SoloItemCounts = { hint: 0, initial: 0, skip: 0 };

export function isSoloItemKind(v: unknown): v is SoloItemKind {
  return v === 'hint' || v === 'initial' || v === 'skip';
}
/** 고른 개수 다듬기(모르는 값 · 범위 밖은 0~3 으로) */
export function soloItemCounts(v: unknown): SoloItemCounts {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const one = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) ? Math.max(0, Math.min(SOLO_ITEM_MAX, x)) : 0);
  return { hint: one(o.hint), initial: one(o.initial), skip: one(o.skip) };
}
export function soloItemsCost(c: SoloItemCounts): number {
  return SOLO_ITEMS.reduce((s, it) => s + it.price * c[it.kind], 0);
}

export interface SoloQuestionView {
  /** 이 판의 몇 번째 문제(1부터) — 답 · 나감 신호에 같이 보낸다(늦게 온 답을 버린다) */
  n: number;
  text: string;
  category: string;
  grade: number;
  /** 서버 시계 기준 마감(화면 시계는 보여 주기만) · 이 문제의 시간 */
  endsAt: number;
  limitMs: number;
  lives: number;
  correct: number;
  /** ★ R123 — 이 문제에 카드 힌트가 있나(없으면 힌트 아이템이 꺼진다) · 남은 아이템 · 이 문제에서 쓴 것 */
  hasHint?: boolean;
  items?: SoloItemCounts;
  usedHere?: SoloItemKind[];
  /** 이 문제에서 연 힌트 · 초성(다시 붙을 때 다시 보이게) */
  hint?: string | null;
  initial?: string | null;
  /**
   * ★★★ R125 — 정답 지문(찬종 "미리 답을 준비해놓으면 서버 안거치고 바로바로") — R124 의 미리 보기 통(probe)을 갈음한다.
   *   화면은 친 답의 꼬리표(submitTags) 지문이 keys 에 있으면 곧바로 "정답!"(잠근 상자를 열어 정답 · 해설) · 없으면 곧바로 흔든다.
   *   지문은 서버 판정과 똑같다(soloSure 머리) · 정답 글자는 가지 않는다 · 판정 · 점수 · 목숨의 정본은 그대로 서버(solo.result).
   */
  sure?: SoloSure;
}

export interface SoloResultView {
  n: number;
  ok: boolean;
  end: SoloQuestionEnd;
  /** 정답(대표 표기) · 해설 — 맞혀도 · 틀려도 보여 준다 */
  answer: string;
  explanation: string | null;
  lives: number;
  correct: number;
  /** 다음 문제가 나오는 때(서버 시계 · 목숨 0 이면 null) */
  nextAt: number | null;
  /** ★ R123 — 해설이 끝나고 점 카운트가 시작되는 때(서버 시계 · = nextAt − COUNT_MS) · 목숨 0 이면 해설만 보여 주는 끝(그 뒤 끝 화면) */
  countAt?: number | null;
  explainUntil?: number;
  /** 맞힌 때 걸린 ms */
  ms: number | null;
}

export interface SoloWrongView {
  n: number;
  text: string;
  answer: string;
  explanation: string | null;
  end: SoloQuestionEnd;
}

export interface SoloBeltChange {
  before: number | null;
  after: number;
  /** 이번에 받은 띠 포인트(0 = 없음) */
  points: number;
}

export interface SoloEndView {
  correct: number;
  asked: number;
  reason: SoloEndReason;
  best: number;
  newBest: boolean;
  /** ★ R123 — 아이템: 산 것 · 쓴 것 · 돌려받은 포인트 */
  items?: { bought: SoloItemCounts; used: SoloItemCounts; spent: number; refunded: number };
  /** 띠(BELT 스위치를 켰을 때만 · 아니면 undefined) */
  belt?: { step: number | null; next: { step: number; need: number } | null; change: SoloBeltChange | null };
  wrongs: SoloWrongView[];
}

/** 시작 화면 · 로비가 읽는 내 기록(GET /api/solo/me) */
export interface SoloMeView {
  best: number;
  runs: number;
  /** BELT 를 켰을 때만 — null = 띠 없음 */
  belt?: number | null;
  next?: { step: number; need: number } | null;
  /** 지금 도는 판이 있으면 true(다른 탭 · 새로 고침 — 화면이 이어받는다) */
  running: boolean;
}
