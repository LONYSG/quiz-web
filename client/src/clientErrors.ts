// =============================================================================
// ★ R064 (D-264) — 브라우저에서 난 예외를 최근 5개만 기억한다(제보 device.errors 로 함께 간다).
//   "화면이 안 보여요" 같은 제보는 재현이 어렵다 — 그때 난 예외가 있으면 원인을 바로 본다.
// =============================================================================

const errors: string[] = [];

export function noteClientError(msg: string): void {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${msg}`.slice(0, 200));
  if (errors.length > 5) errors.shift();
}

export function recentClientErrors(): string[] {
  return [...errors];
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => noteClientError(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => noteClientError(`promise: ${String((e.reason as Error)?.message ?? e.reason)}`));
}
