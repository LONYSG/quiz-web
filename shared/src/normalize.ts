// =============================================================================
// 정답 문자열 정규화
//
// 명세 원본: R002 4장 + Q-16(확정) + Q-36(아포스트로피·하이픈 통일 확정)
// 현재 유효 규칙: docs/01-GAME-RULES.md
//
// ★ 이 함수는 두 곳에서 쓰인다. 반드시 같은 구현을 공유해야 한다.
//    (1) 서버의 정답 판정 (guide 16·18절)
//    (2) 파이프라인의 question_answers.answer_norm 생성
//    두 곳이 다르면 DB에 저장된 정규화 값과 런타임 판정이 어긋나 정답이 오답 처리된다.
//
// ★ NORMALIZE_VERSION 이 바뀌면 question_answers.answer_norm 전체를 재계산해야 한다.
//    바꿀 때는 docs/07-DECISIONS.md에 이유와 재계산 필요 여부를 기록한다.
// =============================================================================

export const NORMALIZE_VERSION = 1;

/** 제로폭 문자. JavaScript의 \s 에 포함되지 않아 따로 지워야 한다. */
const ZERO_WIDTH_RE = /[​‌‍﻿]/g;

/**
 * 위와 같은 문자 집합이지만 g 플래그가 없는 판정용.
 * ★ g 플래그가 붙은 정규식으로 .test()를 호출하면 lastIndex가 전진해서
 *   같은 입력에 대해 호출마다 다른 결과가 나온다. 반드시 분리해야 한다.
 */
const ZERO_WIDTH_TEST_RE = /[​‌‍﻿]/;

/** 아포스트로피 변형 → ASCII 0x27 (Q-36) */
const APOSTROPHE_RE = /[‘’ʼ´]/g;

/** 하이픈/대시 변형 → ASCII 0x2D (Q-36) */
const HYPHEN_RE = /[‐‑‒–—―−]/g;

/** 전각 영숫자·기호(U+FF01~U+FF5E) → 반각. 오프셋 0xFEE0. */
function fullWidthToHalf(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - 0xfee0);
    } else if (code === 0x3000) {
      // 전각 공백 → 일반 공백. 어차피 다음 단계에서 제거된다.
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 정답 비교용으로 문자열을 정규화한다.
 *
 * 단계 (순서 고정. R002 4-2)
 *   1. Unicode NFC          - iOS/macOS의 NFD(자모 분리) 입력을 흡수한다.
 *                             ★ NFKC를 쓰지 않는다. NFKC는 ① → 1, ㈜ → (주) 처럼
 *                               의미를 바꾸는 변환까지 해서 guide 16절(기호 보존)을 넘어선다.
 *   2. 제로폭 문자 제거      - U+200B~U+200D, U+FEFF
 *   3. 전각 → 반각          - U+FF01~U+FF5E, U+3000
 *   4. 아포스트로피·하이픈 통일 (Q-36)
 *   5. 모든 공백류 제거      - guide 16절 "띄어쓰기 무시"
 *   6. 영문 대소문자 통일    - guide 16절 "영문 대소문자 차이 무시"
 *                             ★ toLocaleLowerCase를 쓰지 않는다. 환경별 결과 차이를 배제한다.
 *
 * 하지 않는 것 (guide 16절)
 *   - 특수문자·기호 제거 안 함.  A+B 와 AB 는 다른 문자열이다.
 *   - 오타 허용, 편집 거리, 유사도 판정 안 함.
 *   - 조사·어미 제거 안 함.  "서울"과 "서울시"는 다른 문자열이다(복수 정답으로 해결).
 *   - 발음기호 제거 안 함.  Café 와 Cafe 는 다른 문자열이다.
 *   - 숫자 표기 변환 안 함.  1945 와 "1945년"은 다른 문자열이다(복수 정답으로 해결).
 */
export function normalizeAnswer(input: unknown): string {
  if (typeof input !== 'string') return '';

  let s = input.normalize('NFC');
  s = s.replace(ZERO_WIDTH_RE, '');
  s = fullWidthToHalf(s);
  s = s.replace(APOSTROPHE_RE, "'").replace(HYPHEN_RE, '-');
  s = s.replace(/\s/g, '');
  s = s.toLowerCase();

  return s;
}

/**
 * 정규화 결과와 원문 인덱스의 대응표를 함께 만든다.
 *
 * 마스킹(Q-35 / Q-42)에서 쓴다. 정규화 문자열에서 정답을 찾은 뒤,
 * 원문의 어느 구간을 가려야 하는지 되돌리기 위해 필요하다.
 *
 * ★ NFC를 문자 단위로 적용하면 결합(e + U+0301 → é) 지점에서 인덱스가 어긋난다.
 *   그래서 NFC는 먼저 문자열 전체에 적용하고, 그 결과(rawNfc)를 기준으로 매핑을 만든다.
 *   따라서 마스킹 결과도 rawNfc를 치환해 만들며, 화면에 표시되는 채팅 텍스트는
 *   NFC 정규화된 형태가 된다. 시각적으로 동일하므로 문제가 없다. (R003 3-3)
 *
 * @returns rawNfc  NFC 적용된 원문
 * @returns norm    정규화 결과
 * @returns map     norm[i] 가 rawNfc 의 어느 인덱스에서 왔는지. 길이는 norm.length + 1
 *                  (마지막 항목은 끝 보초로 rawNfc.length)
 */
export function buildNormalizedIndex(input: string): {
  rawNfc: string;
  norm: string;
  map: number[];
} {
  const rawNfc = input.normalize('NFC');
  let norm = '';
  const map: number[] = [];

  // rawNfc를 코드 유닛 인덱스 기준으로 순회한다.
  // 코드 포인트 단위로 읽되 원문 인덱스는 코드 유닛으로 기록해야 slice가 정확하다.
  let i = 0;
  while (i < rawNfc.length) {
    const cp = rawNfc.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const width = ch.length; // 서로게이트 페어면 2

    // 단계 2~6을 이 한 문자에만 적용한다.
    // ★ 이 정규화에는 한 문자가 2글자 이상으로 늘어나는 변환이 없다
    //   (NFKC를 쓰지 않기 때문이다). 그 사실이 매핑을 단순하게 유지해 준다.
    let piece = ch;
    if (ZERO_WIDTH_TEST_RE.test(piece)) {
      piece = '';
    } else {
      piece = fullWidthToHalf(piece);
      piece = piece.replace(APOSTROPHE_RE, "'").replace(HYPHEN_RE, '-');
      piece = piece.replace(/\s/g, '');
      piece = piece.toLowerCase();
    }

    // ★ map은 norm의 "코드 유닛" 하나마다 한 항목이어야 한다.
    //   이모지처럼 서로게이트 페어(코드 유닛 2개)인 문자를 코드 포인트 단위로 세면
    //   norm.length와 map.length가 어긋나 이후 인덱스가 전부 밀린다.
    norm += piece;
    for (let k = 0; k < piece.length; k += 1) {
      map.push(i);
    }

    i += width;
  }

  map.push(rawNfc.length); // 끝 보초
  return { rawNfc, norm, map };
}
