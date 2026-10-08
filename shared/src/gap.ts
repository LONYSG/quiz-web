// =============================================================================
// ★★ 뒷북 시간 차 표기 (R038 · 건우 확정 규칙)
//
//   "자릿수를 고정하지 않는다 — 소수점 아래에서 처음으로 0이 아닌 자리 + 2자리까지, 반올림"
//     0.0000345866…초 → 0.0000346  ·  0.0135426…초 → 0.0135
//
// ★ 1초 이상 (자체 판단 — 같은 규칙을 소수 부분에 그대로 적용한다):
//     1.2345 → 1.235 (첫 0 아닌 소수 자리 = 1번째 → 3번째까지, 반올림)  ·  2.0512 → 2.0512 (2번째 → 4번째까지)
//     소수 부분이 0 이면 정수만: 2.000000000 → 2
// ★ 반올림이 자리를 올리면 다시 맞춘다: 0.09996 → 0.1000 → 0.100 (첫 0 아닌 자리가 앞으로 옮겨졌다)
//                                       0.9996 → 1.000 → 1.00 (정수로 올라가면 소수 둘째 자리까지)
// ★ 부동소수 오차를 피하려고 **정수 나노초(BigInt)** 로 계산한다. 서버 시계 해상도가 나노초라 최대 9자리다.
// =============================================================================

const NS_PER_SEC = 1_000_000_000n;

/** 나노초 → "0.0000346" 같은 초 문자열 (단위 없이) */
export function formatGapNs(ns: bigint): string {
  if (ns < 0n) return `-${formatGapNs(-ns)}`;
  let int = ns / NS_PER_SEC;
  const frac = ns % NS_PER_SEC;
  if (frac === 0n) return int.toString();

  const digits = frac.toString().padStart(9, '0');
  const first = digits.search(/[1-9]/); // 0-based
  const keep = Math.min(first + 3, 9); // 첫 0 아닌 자리 + 2자리
  const divisor = 10n ** BigInt(9 - keep);
  let q = frac / divisor;
  const r = frac % divisor;
  if (r * 2n >= divisor) q += 1n;

  // ★ 자리 올림
  if (q >= 10n ** BigInt(keep)) {
    int += 1n;
    return `${int}.00`;
  }
  let s = q.toString().padStart(keep, '0');
  // ★ 올림으로 첫 0 아닌 자리가 앞으로 옮겨졌으면 다시 "그 자리 + 2" 로 자른다
  const first2 = s.search(/[1-9]/);
  if (first2 >= 0 && first2 + 3 < s.length) s = s.slice(0, first2 + 3);
  return `${int}.${s}`;
}

/** 초(number) → 표기. ★ 부동소수를 정수 나노초로 바꾼 뒤 계산한다 */
export function formatGapSeconds(sec: number): string {
  return formatGapNs(BigInt(Math.round(sec * 1e9)));
}

/** 서버가 문자열로 보낸 나노초 → 표기 */
export function formatGapNsString(ns: string): string {
  try {
    return formatGapNs(BigInt(ns));
  } catch {
    return '?';
  }
}
