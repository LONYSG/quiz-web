// =============================================================================
// @quiz/shared  공개 표면
//
// 서버와 클라이언트가 함께 참조한다.
// ★ 정답 판정 자체의 권한은 서버에만 있다 (guide 44절).
//   여기 있는 것은 "입력이 같으면 출력이 같은" 순수 함수와 타입뿐이다.
// =============================================================================

export { normalizeAnswer, buildNormalizedIndex, NORMALIZE_VERSION } from './normalize.js';
export { generateHint, HINT_VERSION } from './hint.js';
export { computeRanking, skipThreshold } from './ranking.js';
export { maskAnswers, MASK_SENTINEL, MASK_SHORT_ANSWER_MAX } from './mask.js';
export type { MaskResult } from './mask.js';
export { validateRoomSettings, formatExperienceRate } from './settings.js';
export type { RoomSettingsInput, SettingsValidation, StartMode } from './settings.js';
export * from './protocol.js';
