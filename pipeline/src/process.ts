// =============================================================================
// 배치 가공 (작업 D + E)
//
// 흐름
//   1. 규칙 필터 (무료)           → 탈락은 LLM 을 부르지 않는다
//   2. Gemini 1차 가공             → 판정 + 번역 + 복수 정답
//   3. Gemini 역검증               → 한국어 질문만 주고 정답을 맞혀본다
//   4. 규칙 검사 3종 (무료)        → shared 함수 재사용
//
// ★ 순서가 비용을 결정한다. 무료 검사를 먼저 하고, 1차 가공에서 탈락한 것은
//   역검증을 부르지 않는다. 역검증은 accept 된 것에만 쓴다.
//
// ★ 429 를 받으면 즉시 중단하고 **지금까지의 결과를 반환한다.**
//   버리면 이미 소비한 토큰이 낭비된다. Q-54 의 "그날 중단" 은
//   "작업을 멈춘다" 는 뜻이고 "결과를 버린다" 는 뜻이 아니다.
// =============================================================================

import { LIMITS, MODELS, PROMPT_VERSION, pickBackcheckChain } from './config.js';
import { GeminiClient, RateLimitError, BudgetError } from './gemini.js';
import { ruleFilter } from './filter.js';
import { checkRules } from './rules.js';
import {
  BACKCHECK_SCHEMA,
  PROCESS_SCHEMA,
  buildBackcheckPrompt,
  buildProcessPrompt,
  type ProcessInput,
} from './prompts.js';
import { normalizeAnswer } from '@quiz/shared';
import type {
  AiGenerated,
  AiVerdict,
  BackcheckResult,
  ProcessedItem,
  RawQuestion,
} from './types.js';

/**
 * 한 번의 호출에 넣는 문제 수.
 * ★ config.LIMITS.batchSize 에서 읽는다. 값을 코드에 박지 않는다.
 *   R010 실측으로 10 → 5 로 내렸다. 근거는 config.ts 주석 참조.
 */
const BATCH_SIZE = LIMITS.batchSize;

interface AiItemRaw {
  sourceRef: string;
  verdict: 'accept' | 'reject';
  rejectReason?: string;
  convertible: boolean;
  uniqueAnswer: boolean;
  krAccessible: number;
  koreanTerm: boolean;
  questionKo?: string;
  displayAnswer?: string;
  answers?: string[];
  hintAnswer?: string;
  category?: string;
  difficulty?: string;
  explanation?: string;
  answerLang?: string;
  confidence: number;
}

interface BackcheckItemRaw {
  sourceRef: string;
  answer: string;
  ambiguous: boolean;
  alternatives: string[];
  confidence: number;
}

export interface ProcessStats {
  input: number;
  filtered: number;
  aiRejected: number;
  backcheckRejected: number;
  rulesRejected: number;
  accepted: number;
  /** 필터 단계의 탈락 사유 분포 */
  filterReasons: Record<string, number>;
  /** AI 판정 탈락 사유 분포 */
  aiReasons: Record<string, number>;
  /** ★ 실제로 쓴 모델별 호출 횟수. 체인 때문에 상위 모델이 아닐 수 있다 */
  modelUsage: Record<string, number>;
  /**
   * ★ 실제로 LLM 에 보낸 건수.
   *   예산 카운터는 이 값을 써야 한다. input 을 쓰면 안 된다 —
   *   429 로 중간에 멈추면 손도 대지 않은 건수까지 소비로 기록되어
   *   남은 예산을 실제보다 적게 본다. (R010에서 실제로 그렇게 됐다)
   */
  llmProcessed: number;
  tokens: { total: number; prompt: number; output: number; thoughts: number; calls: number };
  stoppedByRateLimit: boolean;
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** 원본을 그대로 담는 부분 */
function sourceOf(item: RawQuestion): ProcessedItem['source'] {
  return {
    question: item.question,
    correct: item.correct,
    incorrect: item.incorrect,
    category: item.category,
    difficulty: item.difficulty,
  };
}

function baseItem(item: RawQuestion): ProcessedItem {
  return {
    sourceId: item.sourceId,
    sourceRef: item.sourceRef,
    verdict: 'reject',
    rejectedAt: null,
    rejectReasons: [],
    source: sourceOf(item),
    generated: null,
    ai: null,
    backcheck: null,
    rules: null,
    review: { status: 'pending', note: null },
    meta: {
      // ★ 실제로 쓴 모델로 나중에 덮어쓴다. 체인 때문에 항목마다 다를 수 있다.
      processModel: MODELS.processChain[0],
      backcheckModel: null,
      promptVersion: PROMPT_VERSION,
      processedAt: new Date().toISOString(),
      totalTokens: 0,
    },
  };
}

/**
 * ★★ 역검증 판정 규칙 (R010 실측으로 크게 고쳤다)
 *
 * ── 처음 규칙과 그것이 틀린 이유
 *   처음에는 R002 설계대로 "ambiguous 또는 alternatives 2개 이상 → 즉시 reject" 했다.
 *   ★ 실측에서 **역검증 탈락 6건이 전부 오탈락(false reject)** 이었다.
 *
 *     "원 한 바퀴는 몇 도인가?"  우리 정답 [360, 360도, …]
 *        역검증 답 "360도" (일치!)  alternatives ["360도", "360"]  → 오탈락
 *     "알츠하이머는 어느 부위?"   우리 정답 [뇌, Brain]
 *        역검증 답 "뇌" (일치!)     alternatives ["뇌", "대뇌"]     → 오탈락
 *     "…총리를 둔 국가는?"        우리 정답 [영국, 연합왕국, UK]
 *        역검증 답 "영국" (일치!)   alternatives ["영국", "연합왕국", …] → 오탈락
 *
 *   ★ 원인: 모델이 alternatives 에 **같은 답의 표기 변형**을 넣었다.
 *     R002 설계가 말한 "정답이 여럿" 은 **서로 다른 대상**을 뜻한다
 *     (빨강·흰색 국기 → 일본 / 캐나다 / 폴란드처럼).
 *     표기 변형은 오히려 우리가 원하는 것이다. 그것을 근거로 버리면 안 된다.
 *
 * ── 고친 규칙
 *   ★ alternatives 중 **우리 정답 집합 밖에 있는 것**만 비유일성의 증거로 센다.
 *     집합 안으로 정규화되는 것은 표기 변형이므로 무시한다.
 *
 *   모델 답이 우리 집합과 일치
 *     · 집합 밖 대안 없음        → pass
 *     · 집합 밖 대안 있음        → 검수 대기 (버리지 않는다. 사람이 본다)
 *   모델 답이 불일치
 *     · 집합 밖 대안 2개 이상    → reject (진짜로 답이 여럿이다)
 *     · confidence 높음          → reject (번역이 뜻을 바꿨을 가능성)
 *     · confidence 낮음          → 검수 대기
 *
 * ★ 모델이 답한 answer 값 자체를 사실로 신뢰하지 않는다.
 *   R005 실측에서 역검증 모델이 사실 오류를 냈다.
 *   쓰는 것은 "우리 집합과 일치하는가" 와 "집합 밖 대안이 있는가" 두 가지다.
 *
 * ★ 부수 이득: 집합 밖 대안은 **추가할 표기 변형 후보**다. 검수 때 사람이 판단한다.
 */
function judgeBackcheck(
  raw: BackcheckItemRaw,
  answers: readonly string[],
): { result: BackcheckResult; reject: boolean; needsReview: boolean } {
  const normSet = new Set(answers.map((a) => normalizeAnswer(a)));
  const matched = normSet.has(normalizeAnswer(raw.answer));

  // ★ 우리 정답 집합 밖에 있는 대안만 남긴다. 표기 변형은 증거가 아니다.
  const outside = (raw.alternatives ?? []).filter((alt) => {
    const n = normalizeAnswer(alt);
    return n.length > 0 && !normSet.has(n);
  });

  if (matched) {
    if (outside.length === 0) {
      return {
        result: {
          answer: raw.answer,
          result: 'pass',
          confidence: raw.confidence,
          alternatives: [],
          note: null,
        },
        reject: false,
        needsReview: false,
      };
    }
    // ★ 집합 밖 대안이 있으면 버리지 않고 사람에게 넘긴다.
    //   진짜 다른 대상일 수도 있고, 추가할 표기 변형일 수도 있다.
    return {
      result: {
        answer: raw.answer,
        result: 'pass',
        confidence: raw.confidence,
        alternatives: outside,
        note: `역검증이 정답을 맞혔으나 집합 밖 대안을 제시했다: ${outside.join(', ')}. 다른 대상인지, 추가할 표기인지 확인 필요`,
      },
      reject: false,
      needsReview: true,
    };
  }

  // ── 불일치
  if (raw.ambiguous && outside.length >= 2) {
    return {
      result: {
        answer: raw.answer,
        result: 'ambiguous',
        confidence: raw.confidence,
        alternatives: outside,
        note: '역검증에서 서로 다른 정답이 여럿으로 판정되었다',
      },
      reject: true,
      needsReview: false,
    };
  }

  const highConfidence = raw.confidence >= 0.7;
  return {
    result: {
      answer: raw.answer,
      result: 'mismatch',
      confidence: raw.confidence,
      alternatives: outside,
      note: highConfidence
        ? '역검증이 다른 답을 확신했다. 번역이 뜻을 바꿨을 가능성이 있다'
        : '역검증이 답을 맞히지 못했으나 확신이 낮다. 사람이 확인해야 한다',
    },
    reject: highConfidence,
    needsReview: !highConfidence,
  };
}

export interface ProcessOptions {
  client: GeminiClient;
  log?: (message: string) => void;
  /** 처리할 최대 건수 */
  limit?: number;
}

/**
 * 배치를 가공한다.
 *
 * ★ 반환값에는 탈락한 것도 전부 들어 있다.
 *   거부 이유와 함께 보관해야 필터 품질을 나중에 평가할 수 있다 (지시).
 */
export async function processBatch(
  items: readonly RawQuestion[],
  options: ProcessOptions,
): Promise<{ results: ProcessedItem[]; stats: ProcessStats }> {
  const log = options.log ?? (() => {});
  const client = options.client;
  const limit = options.limit ?? items.length;
  const input = items.slice(0, limit);

  const stats: ProcessStats = {
    input: input.length,
    filtered: 0,
    aiRejected: 0,
    backcheckRejected: 0,
    rulesRejected: 0,
    accepted: 0,
    filterReasons: {},
    aiReasons: {},
    modelUsage: {},
    llmProcessed: 0,
    tokens: { total: 0, prompt: 0, output: 0, thoughts: 0, calls: 0 },
    stoppedByRateLimit: false,
  };

  const results: ProcessedItem[] = [];
  const survivors: RawQuestion[] = [];

  // ── 1. 규칙 필터 (무료)
  for (const item of input) {
    const f = ruleFilter(item);
    if (f.pass) {
      survivors.push(item);
      continue;
    }
    stats.filtered += 1;
    for (const r of f.reasons) bump(stats.filterReasons, r);
    const out = baseItem(item);
    out.rejectedAt = 'filter';
    out.rejectReasons = f.reasons;
    results.push(out);
  }
  log(`[process] 규칙 필터: ${input.length} → ${survivors.length} (탈락 ${stats.filtered})`);

  // ── 2~4. LLM 단계
  for (let i = 0; i < survivors.length; i += BATCH_SIZE) {
    const chunk = survivors.slice(i, i + BATCH_SIZE);
    const inputs: ProcessInput[] = chunk.map((c) => ({
      sourceRef: c.sourceRef,
      question: c.question,
      correct: c.correct,
      incorrect: c.incorrect,
      category: c.category,
      difficulty: c.difficulty,
    }));

    let aiItems: AiItemRaw[];
    let processModelUsed: string = MODELS.processChain[0];
    try {
      const r = await client.generateWithChain<{ items: AiItemRaw[] }>(
        MODELS.processChain,
        buildProcessPrompt(inputs),
        PROCESS_SCHEMA,
        { maxOutputTokens: 16384 },
      );
      aiItems = r.value.items ?? [];
      processModelUsed = r.model;
      bump(stats.modelUsage, r.model);
      // ★ 이 청크는 실제로 LLM 을 지났다. 예산에 반영한다.
      stats.llmProcessed += chunk.length;
      stats.tokens.total += r.usage.total;
      stats.tokens.prompt += r.usage.prompt;
      stats.tokens.output += r.usage.output;
      stats.tokens.thoughts += r.usage.thoughts;
      stats.tokens.calls += 1;
      log(
        `[process] 1차 가공 ${i + 1}~${i + chunk.length}/${survivors.length}` +
          ` [${r.model}] (토큰 ${r.usage.total}, 사고 ${r.usage.thoughts})`,
      );
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetError) {
        stats.stoppedByRateLimit = err instanceof RateLimitError;
        log(`[process] ★ 중단: ${err.message}`);
        break;
      }
      throw err;
    }

    const byRef = new Map(aiItems.map((a) => [a.sourceRef, a]));
    const accepted: { raw: RawQuestion; ai: AiItemRaw; generated: AiGenerated }[] = [];

    for (const item of chunk) {
      const ai = byRef.get(item.sourceRef);
      const out = baseItem(item);
      out.meta.processModel = processModelUsed;

      if (!ai) {
        // ★ 모델이 항목을 빠뜨렸다. 조용히 버리지 않고 기록한다.
        out.rejectedAt = 'ai';
        out.rejectReasons = ['ai_missing_item'];
        bump(stats.aiReasons, 'ai_missing_item');
        stats.aiRejected += 1;
        results.push(out);
        continue;
      }

      const verdict: AiVerdict = {
        convertible: ai.convertible,
        uniqueAnswer: ai.uniqueAnswer,
        krAccessible: ai.krAccessible,
        koreanTerm: ai.koreanTerm,
        confidence: ai.confidence,
        rejectReason: ai.rejectReason?.trim() ? ai.rejectReason.trim() : null,
      };
      out.ai = verdict;

      // ★ verdict 를 그대로 믿지 않고 판정 필드로 다시 계산한다.
      //   모델이 verdict="accept" 라면서 krAccessible=1 을 주는 경우가 있을 수 있다.
      const failed: string[] = [];
      if (!ai.convertible) failed.push('convertible');
      if (!ai.uniqueAnswer) failed.push('uniqueAnswer');
      if (ai.krAccessible <= 2) failed.push('krAccessible');
      if (!ai.koreanTerm) failed.push('koreanTerm');

      if (ai.verdict === 'reject' || failed.length > 0) {
        out.rejectedAt = 'ai';
        out.rejectReasons = failed.length
          ? failed
          : [verdict.rejectReason ?? 'ai_reject_unspecified'];
        for (const f of out.rejectReasons) bump(stats.aiReasons, f);
        stats.aiRejected += 1;
        results.push(out);
        continue;
      }

      const generated: AiGenerated = {
        questionKo: (ai.questionKo ?? '').trim(),
        displayAnswer: (ai.displayAnswer ?? '').trim(),
        answers: (ai.answers ?? []).map((a) => a.trim()).filter(Boolean),
        hintAnswer: (ai.hintAnswer ?? '').trim() || null,
        category: (ai.category ?? '기타').trim(),
        difficulty: (ai.difficulty ?? 'medium').trim(),
        explanation: (ai.explanation ?? '').trim(),
        answerLang: (ai.answerLang ?? 'ko').trim(),
      };
      out.generated = generated;

      // 생성 필드가 비어 있으면 accept 로 볼 수 없다
      if (!generated.questionKo || !generated.displayAnswer || generated.answers.length === 0) {
        out.rejectedAt = 'ai';
        out.rejectReasons = ['ai_empty_generation'];
        bump(stats.aiReasons, 'ai_empty_generation');
        stats.aiRejected += 1;
        results.push(out);
        continue;
      }

      accepted.push({ raw: item, ai, generated });
    }

    if (accepted.length === 0) continue;

    // ── 3. 역검증 (accept 된 것만)
    let bcItems: BackcheckItemRaw[] = [];
    // ★ 1차 가공에 실제로 쓴 모델을 제외한 체인으로 역검증한다.
    //   같은 모델로 검증하면 같은 방향으로 틀리는 상관관계가 생겨 무의미해진다.
    const backcheckChain = pickBackcheckChain(processModelUsed);
    let backcheckModelUsed: string = backcheckChain[0]!;
    try {
      const r = await client.generateWithChain<{ items: BackcheckItemRaw[] }>(
        backcheckChain,
        buildBackcheckPrompt(
          accepted.map((a) => ({ sourceRef: a.raw.sourceRef, questionKo: a.generated.questionKo })),
        ),
        BACKCHECK_SCHEMA,
        { maxOutputTokens: 8192 },
      );
      bcItems = r.value.items ?? [];
      backcheckModelUsed = r.model;
      bump(stats.modelUsage, r.model);
      stats.tokens.total += r.usage.total;
      stats.tokens.prompt += r.usage.prompt;
      stats.tokens.output += r.usage.output;
      stats.tokens.thoughts += r.usage.thoughts;
      stats.tokens.calls += 1;
      log(`[process] 역검증 ${accepted.length}건 [${r.model}] (토큰 ${r.usage.total})`);
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetError) {
        stats.stoppedByRateLimit = err instanceof RateLimitError;
        log(`[process] ★ 역검증 중단: ${err.message}`);
        // ★ 역검증을 못 한 것은 accept 로 올리지 않는다. 검수 대기로 남긴다.
        for (const a of accepted) {
          const out = baseItem(a.raw);
          out.ai = {
            convertible: a.ai.convertible,
            uniqueAnswer: a.ai.uniqueAnswer,
            krAccessible: a.ai.krAccessible,
            koreanTerm: a.ai.koreanTerm,
            confidence: a.ai.confidence,
            rejectReason: null,
          };
          out.generated = a.generated;
          out.rejectedAt = 'backcheck';
          out.rejectReasons = ['backcheck_not_run'];
          results.push(out);
        }
        break;
      }
      throw err;
    }

    const bcByRef = new Map(bcItems.map((b) => [b.sourceRef, b]));

    for (const a of accepted) {
      const out = baseItem(a.raw);
      out.meta.processModel = processModelUsed;
      out.meta.backcheckModel = backcheckModelUsed;
      out.ai = {
        convertible: a.ai.convertible,
        uniqueAnswer: a.ai.uniqueAnswer,
        krAccessible: a.ai.krAccessible,
        koreanTerm: a.ai.koreanTerm,
        confidence: a.ai.confidence,
        rejectReason: null,
      };
      out.generated = a.generated;

      const bcRaw = bcByRef.get(a.raw.sourceRef);
      if (!bcRaw) {
        out.rejectedAt = 'backcheck';
        out.rejectReasons = ['backcheck_missing_item'];
        stats.backcheckRejected += 1;
        results.push(out);
        continue;
      }

      const judged = judgeBackcheck(bcRaw, a.generated.answers);
      out.backcheck = judged.result;
      if (judged.reject) {
        out.rejectedAt = 'backcheck';
        out.rejectReasons = [`backcheck_${judged.result.result}`];
        stats.backcheckRejected += 1;
        results.push(out);
        continue;
      }

      // ── 4. 규칙 검사 (무료)
      const rules = checkRules(a.generated);
      out.rules = rules;
      if (!rules.pass) {
        out.rejectedAt = 'rules';
        out.rejectReasons = rules.reasons;
        stats.rulesRejected += 1;
        results.push(out);
        continue;
      }

      out.verdict = 'accept';
      out.rejectedAt = null;
      // ★ 역검증이 못 맞혔지만 확신이 낮은 경우는 검수 대기로 남긴다.
      //   accept 이지만 사람이 반드시 봐야 한다는 표시다.
      if (judged.needsReview) {
        out.review.note = '역검증 불일치(확신 낮음). 사람 확인 필요';
      }
      stats.accepted += 1;
      results.push(out);
    }

    if (stats.stoppedByRateLimit) break;
  }

  return { results, stats };
}
