// =============================================================================
// ★★★ 문제 평가(설문) — R056 · D-246
//
// ★ 찬종(2026-10-21): "문제마다 별로인 문제 평가 버튼이 따로 있어서 설문조사를 하게 하면 어때? 선택지를 몇개 지정 +
//   기타 의견란도 만들어서 문제의 피드백을 여러명한테 받도록 하는거야."
// ★ 👍 좋아 / 👎 별로 + (👎 일 때) 사유 칩 다중 선택 + 기타 의견(결과 화면에서만 · ≤200자).
// ★ 사유는 **코드로 저장** · 라벨은 화면 글 — 순서 그대로 보인다. 👍 는 사유를 받지 않는다.
// ★ 검사(서버 · 단위 테스트 같은 함수): 사유 ⊂ 상수 · 의견 trim ≤200 · vote 1 | -1 | null(null = 취소 = 행 삭제).
// ★ 포인트 보상 없음(장난 유인 — 찬종 "독려할게").
// =============================================================================

export const FEEDBACK_REASONS = [
  { code: 'never_heard', label: '들어본 적도 없는 답' },
  { code: 'too_easy', label: '너무 쉬움' },
  { code: 'unclear', label: '질문이 무슨 말인지 모르겠음' },
  { code: 'answer', label: '답이 틀렸거나 다른 답도 맞을 듯' },
  { code: 'hint', label: '힌트가 이상함(너무 쉽거나 도움 안 됨)' },
  { code: 'boring', label: '알 가치 없음 · 재미없음' },
  { code: 'other', label: '기타(적기)' },
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]['code'];

/** 기타 의견 최대 글자 수 (DB CHECK 와 같다) */
export const FEEDBACK_COMMENT_MAX = 200;

/** 속도 제한 — 한 계정 10초에 20번 */
export const FEEDBACK_RATE = { windowMs: 10_000, max: 20 } as const;

export interface FeedbackInput {
  questionId: string;
  gameId: string;
  /** 1 = 👍 · -1 = 👎 · null = 취소(행 삭제) */
  vote: 1 | -1 | null;
  reasons: FeedbackReason[];
  /** 빈 글은 null */
  comment: string | null;
}

const CODES = new Set<string>(FEEDBACK_REASONS.map((r) => r.code));
const ID = /^\d{1,19}$/;

/**
 * 받은 본문을 검사한다 — 통과하면 정리된 값, 아니면 사람이 읽을 이유.
 * ★ 👍 · 취소는 사유 · 의견을 버린다(👎 에만 붙는다). 사유는 중복을 빼고 상수 순서로.
 */
export function parseFeedbackInput(body: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const questionId = typeof b.questionId === 'number' ? String(b.questionId) : b.questionId;
  const gameId = typeof b.gameId === 'number' ? String(b.gameId) : b.gameId;
  if (typeof questionId !== 'string' || !ID.test(questionId)) return { ok: false, error: '문제 번호가 없어요.' };
  if (typeof gameId !== 'string' || !ID.test(gameId)) return { ok: false, error: '판 번호가 없어요.' };
  const vote = b.vote;
  if (vote !== 1 && vote !== -1 && vote !== null) return { ok: false, error: '평가 값이 이상해요.' };
  const rawReasons = b.reasons ?? [];
  if (!Array.isArray(rawReasons) || rawReasons.some((r) => typeof r !== 'string' || !CODES.has(r))) {
    return { ok: false, error: '없는 사유예요.' };
  }
  const rawComment = b.comment ?? null;
  if (rawComment !== null && typeof rawComment !== 'string') return { ok: false, error: '의견이 글이 아니에요.' };
  const comment = rawComment?.trim() || null;
  if (comment && [...comment].length > FEEDBACK_COMMENT_MAX) return { ok: false, error: `의견은 ${FEEDBACK_COMMENT_MAX}자까지예요.` };
  if (vote !== -1) return { ok: true, value: { questionId, gameId, vote, reasons: [], comment: null } };
  const picked = new Set(rawReasons as string[]);
  const reasons = FEEDBACK_REASONS.map((r) => r.code).filter((c) => picked.has(c));
  return { ok: true, value: { questionId, gameId, vote, reasons, comment } };
}

/** 사유 코드 → 라벨 (모르는 코드는 그대로) */
export function feedbackReasonLabel(code: string): string {
  return FEEDBACK_REASONS.find((r) => r.code === code)?.label ?? code;
}
