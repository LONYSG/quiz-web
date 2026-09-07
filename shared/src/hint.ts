// =============================================================================
// 힌트 생성
//
// 명세 원본: R002 5장 + Q-26 + Q-37(확정) + Q-38(확정, R002 권장안에서 변경됨)
// 현재 유효 규칙: docs/01-GAME-RULES.md
//
// guide 11절
//   · 문제 종료 10초 전부터 힌트를 표시한다 (30~11초 없음 / 10~0초 표시)
//   · 한글 정답: 초성을 표시하고 띄어쓰기는 제거한다.  한글 → ㅎㄱ
//   · 영문 정답: 첫 알파벳을 보여주고 나머지는 _ 로 표시한다.  Apple → A____
//   · 정답 자체가 지나치게 노출되지 않도록 한다
//
// Q-38 (확정): ★ 영문은 단어마다 첫 글자를 노출하고 공백을 유지한다.
//   New York → N__ Y___   /   Van Gogh → V__ G___
//   근거: 한글은 음절마다 초성을 주는데(훈민정음 → ㅎㅁㅈㅇ, 정보 4개) 영문만
//   전체에서 한 글자만 주면 정보량이 크게 비대칭이 되어 영문 정답만 불리해진다.
//   ★ 한글 정답은 guide 11절대로 공백을 제거한다. 영문은 단어 경계를 유지한다.
//
// Q-37 (확정): 전처리 후 길이가 1이면 힌트를 만들지 않는다.
//   ★ 그리고 "생성된 힌트가 정규화 후 정답과 같아지면 무조건 버린다"는 최종 방어선을
//     항상 적용한다. 규칙이 나중에 어떻게 바뀌어도 정답이 그대로 노출되는 일을 막는다.
//     ("e" → 힌트가 "e", "C++" → 힌트가 "C++" 가 되는 결함을 이 방어선이 잡는다)
//
// ★ 힌트는 서버가 남은 10초 시점에 push한다. 문제와 함께 미리 보내면 개발자 도구로
//   30초 시점에 볼 수 있어 guide 11절이 무너진다. (R003 2-4)
// =============================================================================

import { normalizeAnswer } from './normalize.js';

export const HINT_VERSION = 1;

/** 한글 초성 19자. 유니코드 음절 블록의 초성 순서와 같다. */
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const;

const HANGUL_BASE = 0xac00; // '가'
const HANGUL_LAST = 0xd7a3; // '힣'
const HANGUL_BLOCK = 588; // 21 * 28

function isHangulSyllable(cp: number): boolean {
  return cp >= HANGUL_BASE && cp <= HANGUL_LAST;
}

function toChoseong(cp: number): string {
  const index = Math.floor((cp - HANGUL_BASE) / HANGUL_BLOCK);
  return CHOSEONG[index] ?? '?';
}

function isAsciiLetter(ch: string): boolean {
  return /^[A-Za-z]$/.test(ch);
}

function isDigit(ch: string): boolean {
  return /^[0-9]$/.test(ch);
}

/**
 * 힌트 생성 전처리.
 * R002 5-3: 정규화 단계 1~4(NFC / 제로폭 제거 / 전각→반각 / 아포스트로피·하이픈 통일)만
 * 적용하고, 대소문자 통일과 공백 제거는 하지 않는다.
 * ★ 대소문자를 유지하는 이유: 영문 첫 글자를 원래 대소문자로 보여줘야 한다 (Apple → A____).
 * ★ 공백을 여기서 지우지 않는 이유: 한글/영문 규칙이 공백을 다르게 다루므로
 *   본문에서 판단해야 한다 (Q-38).
 */
function preprocess(input: string): string {
  let s = input.normalize('NFC');
  s = s.replace(/[​‌‍﻿]/g, '');
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) out += String.fromCodePoint(code - 0xfee0);
    else if (code === 0x3000) out += ' ';
    else out += ch;
  }
  out = out.replace(/[‘’ʼ´]/g, "'").replace(/[‐‑‒–—―−]/g, '-');
  // 앞뒤 공백과 연속 공백만 정리한다. 단어 경계는 남긴다.
  return out.trim().replace(/\s+/g, ' ');
}

/** 문자열에 한글 음절이 하나라도 있는가 */
function hasHangul(s: string): boolean {
  for (const ch of s) {
    if (isHangulSyllable(ch.codePointAt(0)!)) return true;
  }
  return false;
}

/**
 * 한 글자를 힌트 문자로 바꾼다.
 *  · 한글 음절 → 초성
 *  · 숫자      → '_'   ★ 그대로 노출하면 연도·개수 문제의 정답이 사실상 공개된다
 *  · 그 외     → 그대로 (기호, 문장부호, 한자, 가나 등)
 * 영문자는 단어 단위 규칙이 필요하므로 여기서 처리하지 않는다.
 */
function maskNonLetter(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (isHangulSyllable(cp)) return toChoseong(cp);
  if (isDigit(ch)) return '_';
  return ch;
}

/**
 * 정답으로부터 힌트를 만든다.
 *
 * @param answer      힌트 생성 기준 정답 (questions.hint_answer ?? questions.display_answer)
 * @returns 힌트 문자열, 또는 힌트를 만들 수 없으면 null
 *          null인 경우 클라이언트는 "이 문제는 힌트가 없습니다"를 표시한다 (Q-37)
 */
export function generateHint(answer: unknown): string | null {
  if (typeof answer !== 'string') return null;

  const pre = preprocess(answer);
  if (pre.length === 0) return null;

  const koMode = hasHangul(pre);

  // ── 길이 판정 (Q-37)
  // 한글 모드는 공백을 제거한 길이, 영문 모드는 공백을 뺀 실질 문자 수로 센다.
  const contentLength = [...pre.replace(/\s/g, '')].length;
  if (contentLength <= 1) return null;

  let hint: string;

  if (koMode) {
    // ── 한글이 섞인 정답: guide 11절대로 띄어쓰기를 제거한다.
    //    영문자는 "전체에서 처음 나오는 것 하나만" 노출한다.
    //    (혼합 정답에서 단어 경계를 없앤 상태이므로 단어별 규칙을 적용할 수 없다)
    const chars = [...pre.replace(/\s/g, '')];
    let firstLetterUsed = false;
    hint = chars
      .map((ch) => {
        if (isAsciiLetter(ch)) {
          if (!firstLetterUsed) {
            firstLetterUsed = true;
            return ch;
          }
          return '_';
        }
        return maskNonLetter(ch);
      })
      .join('');
  } else {
    // ── 영문/숫자/기호만인 정답: Q-38 확정대로 단어마다 첫 글자를 노출하고 공백을 유지한다.
    hint = pre
      .split(' ')
      .map((word) => {
        let letterSeen = false;
        return [...word]
          .map((ch) => {
            if (isAsciiLetter(ch)) {
              if (!letterSeen) {
                letterSeen = true;
                return ch;
              }
              return '_';
            }
            return maskNonLetter(ch);
          })
          .join('');
      })
      .join(' ');
  }

  // ── ★ 최종 방어선 (Q-37)
  // 규칙이 어떻게 바뀌든, 생성된 힌트가 정규화 후 정답과 같아지면 힌트를 버린다.
  // "e" 나 "C++" 처럼 가릴 것이 없어 힌트가 정답 그 자체가 되는 경우를 잡는다.
  if (normalizeAnswer(hint) === normalizeAnswer(answer)) return null;

  return hint;
}
