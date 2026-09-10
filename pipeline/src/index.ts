// =============================================================================
// @quiz/pipeline 공개 표면
//
// ★ 게임 서버는 이 패키지를 참조하지 않는다. 단방향 관계다 (pipeline/README.md).
//   파이프라인은 shared 를 참조하고, questions / question_answers 에 쓰기만 한다.
// =============================================================================

export {
  MODELS,
  LIMITS,
  PROMPT_VERSION,
  DATA_DIRS,
  OPENTDB,
  DAY_BOUNDARY,
  pickBackcheckChain,
} from './config.js';
export { GeminiClient, RateLimitError, BudgetError } from './gemini.js';
export type { Usage, CallResult } from './gemini.js';
export {
  loadState,
  saveState,
  checkGate,
  remainingItems,
  today,
  clearRateLimit,
  currentSegment,
  closeSegment,
  canResume,
  canResumeNow,
  recordResume,
  consumedResumes,
  noteCallSucceeded,
  noteRateLimited,
} from './budget.js';
export type { DayState, DaySegment, GateResult, ResumeRecord } from './budget.js';
export { ruleFilter, isHardCategory, hasOptionWrapper } from './filter.js';
export { checkRules, dedupeAnswers, sanitizeVariants } from './rules.js';
export { processBatch } from './process.js';
export { rejudge } from './rejudge.js';
export type { RejudgeStats } from './rejudge.js';
export type { ProcessStats, ProcessOptions, BackcheckItemRaw } from './process.js';
export {
  harvest,
  toRawQuestion,
  makeSourceRef,
  decodeEntities,
  requestToken,
} from './adapters/opentdb.js';
export type { HarvestOptions, HarvestResult } from './adapters/opentdb.js';
export {
  buildProcessPrompt,
  buildBackcheckPrompt,
  PROCESS_SCHEMA,
  BACKCHECK_SCHEMA,
  CATEGORY_KEYS,
} from './prompts.js';
export type { ProcessInput, BackcheckInput } from './prompts.js';
export {
  MAJORS,
  MIDS,
  enabledMids,
  findMid,
  findMajor,
  categoryPath,
  generationOrder,
  treeStats,
} from './categories.js';
export type { MajorCategory, MidCategory } from './categories.js';
export {
  GENERATE_SCHEMA,
  GEN_PROMPT_VERSION,
  buildGeneratePrompt,
  buildSlots,
} from './gen-prompt.js';
export type { GenSlot, GenItem } from './gen-prompt.js';
export { generateBatch, makeGenRef, difficultyBucket, GEN_SOURCE_ID } from './generate.js';
export type { GenerateOptions, GenerateStats } from './generate.js';
export { findDuplicates, similarity, questionKey, DUPE_SIMILARITY_IS_ADVISORY } from './dedupe.js';
export { selectQuestions, explainReason, SELECT } from './select.js';
export { detectOverFiltering, formatAlerts, FILTER_ALERT } from './quarantine.js';
export type { FilterAlert, FilterReport } from './quarantine.js';
export {
  DUPE_JUDGE_SCHEMA,
  buildDupeJudgePrompt,
  toDupeQuestionPairs,
} from './dedupe-llm.js';
export type { DupeQuestionPair, DupeJudgeItem } from './dedupe-llm.js';
export type { SelectInput, SelectResult, SelectReport, SelectReason } from './select.js';
export type { DupeInput, DupePair, DupeReport, DupeLevel, DupeVerdict } from './dedupe.js';
export { judgeBackcheck } from './process.js';
export * from './types.js';
