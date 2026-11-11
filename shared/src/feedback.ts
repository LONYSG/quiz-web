// =============================================================================
// ★★★ 문제 평가(설문) — R056 · D-246
//
// ★ 찬종(2026-10-21): "문제마다 별로인 문제 평가 버튼이 따로 있어서 설문조사를 하게 하면 어때? 선택지를 몇개 지정 +
//   기타 의견란도 만들어서 문제의 피드백을 여러명한테 받도록 하는거야."
// ★ 👍 좋아 / 👎 별로 + (👎 일 때) 사유 칩 다중 선택 + 기타 의견(결과 화면에서만 · ≤200자).
// ★ 사유는 **코드로 저장** · 라벨은 화면 글 — 순서 그대로 보인다. 👍 는 사유를 받지 않는다.
// ★ 검사(서버 · 단위 테스트 같은 함수): 사유 ⊂ 상수 · 의견 trim ≤200 · vote 1 | -1 | null(null = 취소 = 행 삭제).
// ★ 포인트 보상 없음(장난 유인 — 찬종 "독려할게").
// ★★ R068 (찬종 2026-10-26 · docs/19 §7) — 3단계(👍 좋아요 1 · 😐 그냥 0 · 👎 별로 −1) · **정답 공개 시간에 누르면 1P**(서버가 판단 ·
//   같은 문항 한 번 · 하루 상한 없음) · 공개 시간 밖(결과 화면 · 로비 지난 판)은 저장만 0P. 자세한 의견은 제보(채택 +5P).
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

/**
 * ★★★ R096 (D-353 · 브리프 C-2 ⑦) — 노래 맞히기 공개 화면 평가의 👎 사유(노래용) — 한 사람 한 곡 하나 ·
 *   저장 = minigame_results.input.rate(퀴즈 question_feedback 은 questions FK 라 못 쓴다 · 마이그레이션 없음) → "보편성 약한 곡" 실측
 */
export const SONG_FEEDBACK_REASONS = [
  { code: 'unknown', label: '모르는 노래' },
  { code: 'too_easy', label: '너무 쉬움' },
  { code: 'label', label: '제목·가수 표기가 이상함' },
  { code: 'preview', label: '미리듣기가 이상함(다른 판·끊김)' },
] as const;
export type SongFeedbackReason = (typeof SONG_FEEDBACK_REASONS)[number]['code'];

/** 노래 평가 본문 검사 — { gameId, songId, vote: 1|0|-1, reasons[] } (👎 에만 사유) */
export function parseSongFeedbackInput(body: unknown): { ok: true; value: { gameId: string; songId: string; vote: 1 | 0 | -1; reasons: SongFeedbackReason[] } } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const gameId = typeof b.gameId === 'number' ? String(b.gameId) : b.gameId;
  if (typeof gameId !== 'string' || !/^\d{1,19}$/.test(gameId)) return { ok: false, error: '판 번호가 없어요.' };
  if (typeof b.songId !== 'string' || !/^song-\d{4}$/.test(b.songId)) return { ok: false, error: '곡 번호가 없어요.' };
  const vote = b.vote;
  if (vote !== 1 && vote !== 0 && vote !== -1) return { ok: false, error: '평가 값이 이상해요.' };
  const raw = b.reasons ?? [];
  const codes = new Set<string>(SONG_FEEDBACK_REASONS.map((r) => r.code));
  if (!Array.isArray(raw) || raw.some((r) => typeof r !== 'string' || !codes.has(r))) return { ok: false, error: '없는 사유예요.' };
  const picked = new Set(raw as string[]);
  const reasons = vote === -1 ? SONG_FEEDBACK_REASONS.map((r) => r.code).filter((c) => picked.has(c)) : [];
  return { ok: true, value: { gameId, songId: b.songId, vote, reasons } };
}

/** 기타 의견 최대 글자 수 (DB CHECK 와 같다) */
export const FEEDBACK_COMMENT_MAX = 200;

/**
 * ★ R059 (D-254) — 제보 채택 보너스 기본값(찬종이 스크립트 --points 로 바꾼다 · 화면 문구도 이 값)
 *   채택 1건 5P(정답 1개 = 1P) · 월 최다 채택 30P.
 */
export const FEEDBACK_ADOPT_POINTS = 5;
export const FEEDBACK_MONTHLY_TOP_POINTS = 30;
/** ★ R063 (D-260) — 가입 선물(봇 제외 · 기존 회원은 0025 가 소급) */
export const SIGNUP_GIFT_POINTS = 50;

/** ★ R068 — 정답 공개 중 평가 1P (point_grants reason 'rate') */
export const RATE_POINTS = 1;
/** ★ R068 — 3단계 버튼(순서 그대로 보인다) */
export const RATE_CHOICES = [
  { vote: 1, emoji: '👍', label: '좋아요' },
  { vote: 0, emoji: '😐', label: '그냥' },
  { vote: -1, emoji: '👎', label: '별로' },
] as const;
export type RateVote = (typeof RATE_CHOICES)[number]['vote'];

/**
 * ★★ R071 (D-313 · 찬종 2026-11-01 "권장대로") — 평가 요청은 **판마다 무작위 1/3 문항**.
 *   판 시작 때 서버가 문항 수 n 의 ceil(n/3) 개 순번(1부터)을 고른다(방 전원 같은 문항 · 2~3 문항이면 1개).
 *   공개 화면은 이 문항에서만 평가 줄을 보이고 · 이 문항에서만 1P(결과 화면 · 로비 지난 판은 모든 문항 그대로 0P).
 */
export function rateAskCount(n: number): number {
  return n > 0 ? Math.ceil(n / 3) : 0;
}

/** ★ R071 — 1..n 중 rateAskCount(n) 개를 무작위로(오름차순) · rand 는 테스트가 바꾼다 */
export function pickRateAsk(n: number, rand: () => number = Math.random): number[] {
  const all = Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => i + 1);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, rateAskCount(all.length)).sort((a, b) => a - b);
}

/**
 * ★★ R071 (D-313) — 공개 중 👎 는 **사유 하나를 골라야 1P**(👍 😐 는 누르면 바로 1P).
 *   사유 없는 👎 는 저장만 · 응답 needReason: true → 같은 공개 시간 안에 사유를 붙여 다시 보내면 그때 1P.
 */
export function rateNeedsReason(vote: 1 | 0 | -1 | null, reasons: readonly string[]): boolean {
  return vote === -1 && reasons.length === 0;
}

/** 속도 제한 — 한 계정 10초에 20번 */
export const FEEDBACK_RATE = { windowMs: 10_000, max: 20 } as const;

export interface FeedbackInput {
  questionId: string;
  gameId: string;
  /** 1 = 👍 · 0 = 😐(R068) · -1 = 👎 · null = 취소(행 삭제 — 공개 중 1P 를 받은 표는 지우지 않는다) */
  vote: 1 | 0 | -1 | null;
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
  if (vote !== 1 && vote !== 0 && vote !== -1 && vote !== null) return { ok: false, error: '평가 값이 이상해요.' };
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
