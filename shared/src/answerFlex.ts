// =============================================================================
// ★★★ 복수정답 유연화 — 안전한 변환만 (R057 · D-251)
//
// ★ 찬종: "복수정답 처리도 좀만 더 유연하게 해줘."
// ★★ 01 10장 "오타 허용이나 유사도 판정을 하지 않는다" 는 그대로다 — 글자를 **지우기만** 하는 변환 넷:
//   ① paren   괄호와 괄호 안 글자 — "이순신(李舜臣)" = "이순신"            (정답 · 제출 둘 다)
//   ② punct   가운뎃점 · 중점 · 마침표 · 쉼표 · 물결 — "U.S.A" = "USA"     (정답 · 제출 둘 다 · 숫자만인 글의 소수점은 둔다)
//   ③ ending  끝의 "이다 · 입니다 · 요 · 임" — "이순신이다" = "이순신"      (★ 제출 쪽만 — 정답 "사이다" 가 "사" 가 되지 않게 · 남은 글이 2자 이상)
//   ④ article 영문 정답 앞의 관사 the · a · an — "The Beatles" = "Beatles" (정답 · 제출 둘 다 · 한글이 없을 때만)
// ★ 순서: ① → ④ → ② → 정규화(normalizeAnswer). 변환 뒤 빈 글은 버린다.
// ★ 켜는 변환은 FLEX_ENABLED — 활성 정답 전체로 잰 충돌(두 문항의 정답이 같아짐)이 있는 변환은 넣지 않는다(npm run answers:flex).
// ★ 호칭(장군 · 대왕 · 씨 · 님 · 선생) · 조사(은 · 는 · 이 · 가) · 오타(거리 1)는 넣지 않는다 — 표만(13 A82).
// =============================================================================

import { normalizeAnswer } from './normalize.js';

export type FlexTransform = 'paren' | 'punct' | 'ending' | 'article';

/** ★ 켜진 변환 (측정 뒤 정한다 — 10 38절 · 07 D-251) */
export const FLEX_ENABLED: readonly FlexTransform[] = ['paren', 'punct', 'ending', 'article'];

const PAREN_RE = /[(（[［][^()（）[\]［］]*[)）\]］]/g;
const PUNCT_RE = /[·・･‧∙.,，~〜～]/g;
const ENDING_RE = /(입니다|이다|요|임)$/;
const ARTICLE_RE = /^\s*(the|a|an)\s+/i;
const HANGUL_RE = /[가-힣ㄱ-ㆎ]/;

export function stripParens(s: string): string {
  return s.replace(PAREN_RE, ' ');
}
/** ★ 숫자만인 글(3.14 · 1,000)은 소수점을 지우지 않는다 — "314" 가 "3.14" 로 맞지 않게(쉼표만 뗀다) */
export function stripPunct(s: string): string {
  if (/^[\d\s.,，]+$/.test(s)) return s.replace(/[,，]/g, '');
  return s.replace(PUNCT_RE, '');
}
/** 끝맺음 — 끝의 물음표 · 느낌표 · 마침표는 먼저 뗀다("이순신이다!" → "이순신"). 끝맺음이 없으면 그대로(문장부호만 떼지 않는다) */
export function stripEnding(s: string): string {
  const t = s.trim().replace(/[?!？！.]+$/, '').trim();
  return ENDING_RE.test(t) ? t.replace(ENDING_RE, '') : s;
}
export function stripArticle(s: string): string {
  return HANGUL_RE.test(s) ? s : s.replace(ARTICLE_RE, '');
}

/** 정답 · 제출 공통 표준형 — 켜진 ①④② 를 적용하고 정규화 */
export function flexCanon(raw: string, enabled: readonly FlexTransform[] = FLEX_ENABLED): string {
  let s = raw.normalize('NFC');
  if (enabled.includes('paren')) s = stripParens(s);
  if (enabled.includes('article')) s = stripArticle(s);
  if (enabled.includes('punct')) s = stripPunct(s);
  return normalizeAnswer(s);
}

/** 문제 하나의 표준형 정답 집합(정규화 정답과 다른 것만) — 문제 시작 때 한 번 만든다 */
export function flexAnswerSet(answersRaw: readonly string[], answersNorm: ReadonlySet<string>, enabled: readonly FlexTransform[] = FLEX_ENABLED): Set<string> {
  const out = new Set<string>();
  for (const a of answersRaw) {
    const c = flexCanon(a, enabled);
    if (c && !answersNorm.has(c)) out.add(c);
  }
  return out;
}

/**
 * ★ 변환으로 맞았나 (정규화 그대로 맞은 것은 부르는 쪽이 먼저 본다).
 *   ①②④ 표준형이 정답(정규화 · 표준형)과 같다 · 또는 ③ 끝맺음을 뗀 제출이 같다(남은 글 2자 이상)
 */
export function flexMatch(rawSub: string, answersNorm: ReadonlySet<string>, answersFlex: ReadonlySet<string>, enabled: readonly FlexTransform[] = FLEX_ENABLED): boolean {
  const hit = (c: string, min = 1) => c.length >= min && (answersNorm.has(c) || answersFlex.has(c));
  if (hit(flexCanon(rawSub, enabled))) return true;
  if (!enabled.includes('ending')) return false;
  const e = stripEnding(rawSub);
  if (e === rawSub) return false;
  return hit(normalizeAnswer(e), 2) || hit(flexCanon(e, enabled), 2);
}
