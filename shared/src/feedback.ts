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
// ★★★ R099 (찬종 2026-11-12 #127 "평가 버튼 그냥 빼자. 평가는 나만 할게 — 제보로") — 평가 입력을 전부 뺐다(공개 화면 · 결과 · 로비 · 노래).
//   남은 것: 사유 코드(제보 📝 칩이 같이 쓴다) · 노래 사유 라벨(song:feedback 이 옛 기록을 읽는다) · 포인트 상수.
//   옛 표(question_feedback · minigame_results.input.rate · point_grants 'rate')는 지우지 않는다 — 지난 기록 읽기용.
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

/** 사유 코드 → 라벨 (모르는 코드는 그대로) */
export function feedbackReasonLabel(code: string): string {
  return FEEDBACK_REASONS.find((r) => r.code === code)?.label ?? code;
}
