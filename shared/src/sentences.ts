// =============================================================================
// 문제 지문을 문장으로 나눈다 (R035 / 건우 요청)
//
// ★ 건우: "문제가 2문장 이상이면 중간에 줄바꿈을 해서 글이 최대한 끊기지 않게.
//          한 문장이 줄이 바뀌어 버리면 가독성이 확 떨어진다."
// ★ 화면은 문장마다 줄을 바꾸고, 문장이 길면 글자를 조금 줄여 한 줄에 넣는다 (client QuestionText).
//
// ★ 나누는 기준 (자체 판단 — D-164)
//   · 문장 끝: `.` `?` `!` `…` (와 그 뒤의 닫는 따옴표·괄호) **다음에 공백**이 올 때
//   · 예외 — 나누지 않는다
//     - 공백이 없는 점: 숫자 속 점(3.14) · 도메인 · "U.S.A" 처럼 붙은 약어
//     - 점 앞이 **영문 대문자 한 글자**: "J. K. 롤링" · "U. S."
//     - 점 앞이 흔한 영문 약어: Mr Mrs Ms Dr St Jr Sr vs etc No Vol Mt Ft
//     - 점 앞이 숫자이고 뒤가 숫자: "1. 2." 같은 목록은 드물어 다루지 않는다 (숫자 뒤 점 + 공백은 나눈다 — 확인 필요)
//     - 괄호·따옴표 **안**의 문장 끝 (예: '"왜?" 라고 물었다' / '“나는 왕이다.” 이 대사는' — 인용은 한 덩어리로 둔다)
// ★ 순수 함수다. 입력이 같으면 출력이 같다. 나눈 조각을 이으면(공백 하나로) 원문과 같은 글자들이다.
// =============================================================================

const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'etc', 'no', 'vol', 'mt', 'ft']);
const OPEN = new Set(['(', '[', '{', '「', '『', '“', '‘']);
const CLOSE = new Set([')', ']', '}', '」', '』', '”', '’']);
const END = new Set(['.', '?', '!', '…']);

export function splitSentences(text: string): string[] {
  const s = text.trim();
  if (!s) return [];
  const out: string[] = [];
  let depth = 0;
  let straightQuote = false; // " 는 열고 닫는 글자가 같다
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (OPEN.has(ch)) depth += 1;
    else if (CLOSE.has(ch)) depth = Math.max(0, depth - 1);
    else if (ch === '"') straightQuote = !straightQuote;
    if (!END.has(ch)) continue;
    // 끝 기호가 이어지면(?! / ...) 마지막 것까지 묶는다
    let j = i;
    while (j + 1 < s.length && END.has(s[j + 1]!)) j += 1;
    // ★ 문장 끝 기호가 괄호·따옴표 **안**에 있으면 그 뒤에서 나누지 않는다 ('"왜?" 라고 물은…')
    const inside = depth > 0 || straightQuote;
    // 문장 끝 뒤의 닫는 따옴표·괄호는 앞 문장에 붙인다
    let k = j;
    while (k + 1 < s.length && (CLOSE.has(s[k + 1]!) || s[k + 1] === '"')) {
      if (CLOSE.has(s[k + 1]!)) depth = Math.max(0, depth - 1);
      else straightQuote = !straightQuote;
      k += 1;
    }
    i = k;
    // ★ 다음 글자가 공백이 아니면 문장 끝이 아니다 (3.14 / U.S.A / 붙은 점)
    if (k + 1 >= s.length || !/\s/.test(s[k + 1]!)) continue;
    // ★ 괄호·따옴표 안이면 나누지 않는다
    if (inside || depth > 0 || straightQuote) continue;
    if (s[j] === '.' && isAbbrevBefore(s, j)) continue;
    out.push(s.slice(start, k + 1).trim());
    start = k + 1;
  }
  const rest = s.slice(start).trim();
  if (rest) out.push(rest);
  return out.length > 0 ? out : [s];
}

/** dotIndex 의 점 바로 앞 낱말이 약어인가 */
function isAbbrevBefore(s: string, dotIndex: number): boolean {
  let b = dotIndex - 1;
  while (b >= 0 && /[A-Za-z]/.test(s[b]!)) b -= 1;
  const word = s.slice(b + 1, dotIndex);
  if (word.length === 1 && /[A-Z]/.test(word)) return true;
  return ABBREV.has(word.toLowerCase());
}
