// =============================================================================
// ★★★ R118 (docs/24 5-4) — 띠 칸 메모리(닉네임 · 사진과 같은 길): 로그인(소켓 핸드셰이크) 때 읽고, 솔로가 끝나 오르면 고친다.
//   방 스냅샷의 사람 칸(toPlayerView)이 여기서 읽는다 — 스위치 BELT 가 꺼져 있으면 아무도 읽지 않는다(칸 자체가 없다).
// =============================================================================

const belts = new Map<string, number | null>();

export function setBelt(accountId: string, step: number | null): void {
  belts.set(accountId, step);
}
/** 모르면(아직 안 읽음) null = 띠 없음 */
export function beltOf(accountId: string): number | null {
  return belts.get(accountId) ?? null;
}
