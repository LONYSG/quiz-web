// =============================================================================
// ★★ 닉네임 폭 한도 (R040 · 건우 확정 — Q-05 개정)
//
// ★ 건우 (R040): "글자마다 폭을 다르게 센다 — 한글 1칸 · 영어·숫자 0.8칸."
// ★★ R041 (건우): "글자 제한은 **한글 기준 10자**면 된다. 저해상도에서도 한글 10자를 표기할 수 있게 조정하자."
//   → 합계 **10칸** 이하 (한글만 10자 / 영어·숫자만 12자 / 섞으면 그 사이). 화면은 글자를 자리에 맞춰 줄인다(FitText).
// ★★ 회원가입 · 닉네임 변경 · 서버 검증 · 기존 긴 닉네임 판정이 **전부 이 함수 하나**를 쓴다.
//
// ★ 그 밖의 글자 (자체 판단 — R040 보고서 1장 A-9)
//   · ASCII 기호·공백(! ? - _ . 등)  0.8칸 — 영어·숫자와 같은 반각 글자. 대부분 영문자보다 좁다
//   · 이모지(그림 글자 · 국기 조각)  1.2칸 — 화면에서 한글보다 넓게 그려진다 (Twemoji 아님 — 닉네임은 글자로 그린다)
//   · 결합 문자 · ZWJ · 변형 선택자 · 피부색 조각  0칸   — 혼자서는 폭이 없다 (앞 글자에 붙는다)
//   · 나머지(한자 · 가나 · 전각 · 그 밖의 문자) 1칸 — 한글과 같은 전각 폭으로 본다
// ★ 계산은 0.1칸 단위 정수로 한다 (부동소수 오차로 8.000001 이 거부되지 않게).
// =============================================================================

/** 닉네임 폭 한도 (칸) — R040 8 → ★ R041 10 */
export const NICKNAME_MAX_UNITS = 10;
const MAX_TENTHS = NICKNAME_MAX_UNITS * 10;

const ZERO_WIDTH = /[\p{M}\u200d\ufe00-\ufe0f\u20e3\u{1f3fb}-\u{1f3ff}]/u;
const EMOJI = /[\p{Extended_Pictographic}\u{1f1e6}-\u{1f1ff}]/u;

/** 한 글자(코드 포인트)의 폭 — 0.1칸 단위 */
function tenthsOf(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x20 && cp <= 0x7e) return 8;
  if (ZERO_WIDTH.test(ch)) return 0;
  if (EMOJI.test(ch)) return 12;
  return 10;
}

/** 닉네임 폭 (칸). 예: "가나다" 3 · "abc" 2.4 · "가a" 1.8 */
export function nicknameUnits(nickname: string): number {
  let t = 0;
  for (const ch of nickname) t += tenthsOf(ch);
  return t / 10;
}

/** ★ 한도 안인가 (10칸 이하) — 앞뒤 공백은 서버가 따로 막는다 */
export function nicknameFits(nickname: string): boolean {
  let t = 0;
  for (const ch of nickname) t += tenthsOf(ch);
  return t <= MAX_TENTHS;
}

/** 한도를 넘을 때 안내 — 서버 오류 · 화면 안내가 같은 문구 */
export const NICKNAME_TOO_LONG_MESSAGE = '글자 수를 넘었어요 — 한글 10자 · 영어·숫자 12자까지';
/** 한도 안내 한 줄 (입력칸 자리표시 · 안내) */
export const NICKNAME_LIMIT_HINT = '한글 10자 · 영어·숫자 12자까지';
