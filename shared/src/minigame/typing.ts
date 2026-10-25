// =============================================================================
// ★★★ 타자 (R051 · D-237) — 제시 문장(한글 · 영어)을 정확히 빨리
//
// ★ 찬종: "제시 문장(한글 · 영어) 정확히 빨리. 모바일도 같은 문장 · 제시 문장 복사 금지".
// ★ 3판 — 한글 짧은 것 · 영어 · 한글 긴 것(typing-sentences.ts). 한 판(미니게임 한 번) 안에서 문장은 겹치지 않는다(목록이 셋으로 나뉘어 있다).
// ★ 완성 = 입력이 제시와 **정확히 같은 순간**(공백 · 구두점 포함). 비교는 NFC 로 맞춘 뒤(조합형 자모로 오는 기기 — 봇 "한글 조합").
//   시간 = 문장이 보인 순간(판 시작 신호를 받은 때)부터 완성까지 — 기기 시간. 제한 30초.
//   못 끝내면 미제출 — 진행률(앞에서부터 맞게 친 글자 수 ÷ 문장 길이)로 **못 끝낸 사람끼리** 순위(끝낸 사람보다 아래).
// ★ 서버 검사: 완성 글이 문장과 같은가 · 걸린 시간 ≤ 흐른 시간 + 250ms · 걸린 시간 ≥ 글자 수 × 40ms(초당 25자 — 사람 손 밖)
// =============================================================================

import { seededRandom } from '../balance.js';
import { TYPING_EN, TYPING_KO_LONG, TYPING_KO_SHORT } from './typing-sentences.js';

export const TYPING_ROUNDS = 3;
export const TYPING_PLAY_MS = 30_000;
/**
 * ★ R067 (D-297 · 찬종 "시간을 좀 더 늘리더라도 직접 키보드로 칠 수 있게 중간 대기 때 텍스트 상자") — 타자만 준비(ready)를 3초 더(1.5 → 4.5초).
 *   그동안 연습 입력칸에 미리 쳐 본다(점수 없음) · 다른 게임 준비 시간은 그대로(MINIGAME_TIMING.READY_MS).
 */
export const TYPING_READY_MS = 4_500;
/** 한 글자에 이보다 빠르면 사람 손이 아니다 (붙여넣기 · 조작) */
export const TYPING_MIN_MS_PER_CHAR = 40;
/** 못 끝낸 사람의 순위 값 — 끝낸 사람(≤ 30초)보다 항상 뒤 · 진행률이 높을수록 앞 */
export const TYPING_UNFINISHED_BASE = 1_000;

export type TypingLang = 'ko' | 'en';

export interface TypingRoundSpec {
  lang: TypingLang;
  size: 'short' | 'long';
  /** 목록 번호 (기록 item_key) */
  index: number;
  text: string;
}

export function typingNorm(s: string): string {
  return s.normalize('NFC');
}

/** 글자 수(코드 포인트) */
export function typingLength(s: string): number {
  return [...typingNorm(s)].length;
}

/** 판 구성 — 한글 짧은 것 · 영어 · 한글 긴 것 */
export function typingRounds(seed: number): TypingRoundSpec[] {
  const rnd = seededRandom((seed ^ 0x7e1e) >>> 0);
  const pick = (list: readonly string[]) => Math.floor(rnd() * list.length);
  const a = pick(TYPING_KO_SHORT);
  const b = pick(TYPING_EN);
  const c = pick(TYPING_KO_LONG);
  return [
    { lang: 'ko', size: 'short', index: a, text: TYPING_KO_SHORT[a]! },
    { lang: 'en', size: 'short', index: b, text: TYPING_EN[b]! },
    { lang: 'ko', size: 'long', index: c, text: TYPING_KO_LONG[c]! },
  ];
}

/** 앞에서부터 맞게 친 글자 수 */
export function typingCorrectPrefix(target: string, typed: string): number {
  const t = [...typingNorm(target)];
  const u = [...typingNorm(typed)];
  let i = 0;
  while (i < t.length && i < u.length && t[i] === u[i]) i += 1;
  return i;
}

/** 진행률 0~1 */
export function typingProgress(target: string, typed: string): number {
  const n = typingLength(target);
  return n === 0 ? 0 : typingCorrectPrefix(target, typed) / n;
}

export function typingComplete(target: string, typed: string): boolean {
  return typingNorm(target) === typingNorm(typed);
}

export type TypingMark = 'ok' | 'bad' | 'todo' | 'composing';

/** 화면 — 글자마다 맞음 · 틀림 · 아직. composing = 조합 중인 글자 수(끝에서) — 틀림으로 칠하지 않는다 */
export function typingMarks(target: string, typed: string, composing: number): TypingMark[] {
  const t = [...typingNorm(target)];
  const u = [...typingNorm(typed)];
  const composeFrom = u.length - Math.max(0, composing);
  return t.map((ch, i) => {
    if (i >= u.length) return 'todo';
    if (u[i] === ch) return 'ok';
    return i >= composeFrom ? 'composing' : 'bad';
  });
}
