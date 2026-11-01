// =============================================================================
// ★★ R071 (D-313 · docs/19 §7) — 평가 요청 문항(판마다 무작위 1/3) 기록
//
// ★ 방 메모리의 game.rateAsk(순번)는 판이 끝나면 사라진다. 결과 화면 · 로비 "지난 판" 에서 들어온 표도
//   "그 문항이 그 판의 요청 문항이었나"(question_feedback.asked)를 알 수 있게, 정답을 공개할 때 판 번호 → 문항 id 를 적어 둔다.
// ★ 메모리뿐(서버가 하나) · 최근 판 MAX_GAMES 개만 · 서버를 다시 켜면 그 전 판은 asked = false(보고서가 안다 — 0027 주석).
// =============================================================================

const MAX_GAMES = 500;
const asked = new Map<string, Set<string>>();

/** 정답 공개 때 — 이 판의 이 문항이 요청 문항이면 적는다 */
export function noteRateAsk(gameId: string, questionId: string): void {
  let set = asked.get(gameId);
  if (!set) {
    set = new Set();
    asked.set(gameId, set);
    // ★ 오래된 판부터 버린다(Map 은 넣은 순서를 지킨다)
    while (asked.size > MAX_GAMES) asked.delete(asked.keys().next().value!);
  }
  set.add(questionId);
}

/** 이 판의 이 문항이 요청 문항이었나 */
export function wasRateAsked(gameId: string, questionId: string): boolean {
  return asked.get(gameId)?.has(questionId) ?? false;
}
