// =============================================================================
// ★★★ R085 — OX(ox) 항목 형식 검사 (docs/18 §11) — minigame-load.mjs 가 부른다 · 단위 테스트(minigame-ox.test.mjs)
//
// ★ 칸: 공통(§0 — id · status · createdRound · sources · tags · verify — image 없음) + statement · answer · explanation · category{l1, l2} ·
//   grade(1~3) · trap(none · number · name · place · time · cause) · pairId(글 · null) · factClaim(선택 — G041 이 적은 사실 요지)
// =============================================================================

export const OX_FIELDS = ['statement', 'answer', 'explanation', 'category', 'grade', 'trap', 'pairId'];
export const OX_OPTIONAL = ['image', 'factClaim'];
export const OX_TRAPS = ['none', 'number', 'name', 'place', 'time', 'cause'];

const len = (s) => [...String(s ?? '')].length;

/** ox 항목 하나의 칸별 문제(빈 배열이면 통과) — 공통 칸 · 모르는 칸 검사는 부르는 쪽 */
export function oxProblems(it) {
  const p = [];
  if (typeof it.statement !== 'string' || len(it.statement) < 10 || len(it.statement) > 120) p.push('statement 10~120자');
  if (typeof it.answer !== 'boolean') p.push('answer true/false');
  if (typeof it.explanation !== 'string' || !it.explanation.trim() || len(it.explanation) > 200) p.push('explanation');
  if (!it.category || typeof it.category.l1 !== 'string' || !it.category.l1 || typeof it.category.l2 !== 'string') p.push('category');
  if (![1, 2, 3].includes(it.grade)) p.push('grade 1~3');
  if (!OX_TRAPS.includes(it.trap)) p.push(`trap ${it.trap}`);
  else if ((it.answer === true) !== (it.trap === 'none')) p.push('trap ↔ answer(참 = none · 거짓 = 한 축)');
  if (it.pairId !== null && (typeof it.pairId !== 'string' || !it.pairId)) p.push('pairId');
  return p;
}
