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
export { splitSentences } from './sentences.js';
export { formatGapNs, formatGapNsString, formatGapSeconds } from './gap.js';
export { nicknameUnits, nicknameFits, NICKNAME_MAX_UNITS, NICKNAME_TOO_LONG_MESSAGE, NICKNAME_LIMIT_HINT } from './nickname.js';
export { maskAnswers, MASK_SENTINEL, MASK_SHORT_ANSWER_MAX } from './mask.js';
// ★★★ R057 — 이모티콘 나열(인라인) 토큰 · 복수정답 유연화
export * from './emojiText.js';
export * from './answerFlex.js';
export type { MaskResult } from './mask.js';
export {
  validateRoomSettings,
  formatExperienceRate,
  DIFFICULTY_TIERS,
  DEFAULT_DIFFICULTIES,
  difficultyScores,
  formatDifficulties,
  GAME_TOPICS,
  DEFAULT_TOPICS,
  formatTopics,
  MINIGAME_ONLY_ROUNDS,
} from './settings.js';
export type {
  RoomSettingsInput,
  SettingsValidation,
  StartMode,
  DifficultyTier,
  DifficultyTierInfo,
  GameTopic,
  GameTopicInfo,
} from './settings.js';
export * from './protocol.js';
// ★★★ R050 — 미니게임
export * from './minigame.js';
export * from './balance.js';
// ★★★ R051 — 미니게임 2차 (번개손 · 타자 · 완벽한 원 · 각도 맞추기)
export * from './minigame/reaction.js';
export * from './minigame/typing.js';
export * from './minigame/typing-sentences.js';
export * from './minigame/circle.js';
export * from './minigame/angle.js';
// ★★★ R052 — 퀴즈류 미니게임
export * from './minigame/quiz.js';
// ★★★ R053 — 미니게임 3차
export * from './minigame/r053.js';
export * from './minigame/oddone-pairs.js';
// ★★ R054 — 업적 · 미니게임 4차
export * from './achievements.js';
export * from './minigame/r054.js';
// ★★★ R056 — 문제 평가(설문)
export * from './feedback.js';
