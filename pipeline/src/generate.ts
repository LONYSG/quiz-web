// =============================================================================
// 문제 생성 오케스트레이션 (작업 D / R011)
//
// ★ R010의 흐름을 그대로 재사용한다. 새로 만들지 않는다 (작업 E 지시).
//     [수확 → 규칙 필터] → [1차 가공] → [역검증] → [규칙 검사] → [검수] → [적재]
//   에서 앞의 두 단계만 [생성] 으로 바뀐다. 뒤는 그대로다.
//
//     생성 → ★ 역검증 → 규칙 검사 → 중복 판정 → 검수 → 적재
//
// ★★ 역검증을 유지하는 이유 (건우 지시: "어느 경우에도 유지한다")
//   생성은 가공보다 위험하다. 가공은 원본이 사실이라는 전제가 있었지만
//   생성은 모델이 사실을 틀리게 만들거나 애매한 문제를 지어낼 수 있다.
//   ★ 게다가 자기가 만든 문제를 자기가 검증하면 아무 의미가 없으므로
//     생성에 쓴 모델을 역검증 체인에서 제외한다 (pickBackcheckChain, R010 그대로).
//
// ★★ 단계별 게이트 (작업 D-5)
//   역검증을 싼 모델(3.5-flash-lite)로 먼저 돌리고, 그 결과가 애매한 것만
//   상위 모델로 올린다. 근거와 판단은 R011 보고서 4-5 에 적었다.
//   여기서는 escalate 조건만 코드로 남긴다.
// =============================================================================

import { createHash } from 'node:crypto';

import { normalizeAnswer } from '@quiz/shared';

import { findMid, findMajor, type MidCategory } from './categories.js';
import { LIMITS, MODELS, PROMPT_VERSION, pickBackcheckChain } from './config.js';
import { currentSegment } from './budget.js';
import {
  BACKCHECK_SCHEMA,
  buildBackcheckPrompt,
} from './prompts.js';
import {
  GENERATE_SCHEMA,
  GEN_PROMPT_VERSION,
  buildGeneratePrompt,
  buildSlots,
  type GenItem,
  type GenSlot,
} from './gen-prompt.js';
import { BudgetError, GeminiClient, RateLimitError } from './gemini.js';
import { judgeBackcheck } from './process.js';
import { checkRules, dedupeAnswers, sanitizeVariants } from './rules.js';
import type { AiGenerated, ProcessedItem } from './types.js';

/** ★ 생성 문제의 소스 식별자. OpenTDB 것과 구분된다 (작업 E) */
export const GEN_SOURCE_ID = 'gemini-gen';

/** 역검증 응답 한 건 (prompts.ts 의 BACKCHECK_SCHEMA 와 짝) */
interface BackcheckRaw {
  sourceRef: string;
  answer: string;
  ambiguous: boolean;
  alternatives: string[];
  confidence: number;
}

export interface GenerateOptions {
  client: GeminiClient;
  /** 이번에 다룰 중분류 목록 (순서가 우선순위다) */
  mids: readonly MidCategory[];
  /** 중분류당 몇 건 */
  perMid: number;
  /** 한 API 호출에 몇 개 중분류를 넣는가 */
  midsPerCall: number;
  /** ★ 소분류 시작 위치. 같은 중분류를 두 번째로 돌 때 쓴다 */
  subOffset?: number;
  /**
   * ★ 슬롯을 직접 지정한다. 주면 mids/perMid/subOffset 을 무시한다.
   *
   * ★ 왜 필요한가 (R012 작업 A)
   *   Gemini 와 Claude Code 의 생성 품질을 비교하려면 **양쪽이 정확히 같은 슬롯**을
   *   받아야 한다. 카테고리 트리에서 자동으로 뽑으면 소분류 선택이 달라질 수 있다.
   *   ★ 조건이 다르면 비교가 성립하지 않는다.
   */
  explicitSlots?: readonly GenSlot[];
  log?: (msg: string) => void;
  /** 상태 파일. 구간별 건수를 누적한다 (작업 B) */
  state?: { items: number; segments?: unknown } | null;
}

export interface GenerateStats {
  requestedSlots: number;
  /** ★ 실제로 LLM 을 지난 슬롯 수. 예산에 반영하는 값이다 (R010 카운터 버그 교훈) */
  llmSlots: number;
  returned: number;
  missing: number;
  offCategory: number;
  emptyGeneration: number;
  backcheckRejected: number;
  rulesRejected: number;
  accepted: number;
  /** 단계별 게이트에서 상위 모델로 올린 건수 */
  escalated: number;
  modelUsage: Record<string, number>;
  rejectReasons: Record<string, number>;
  tokens: { total: number; prompt: number; output: number; thoughts: number; calls: number };
  stoppedByRateLimit: boolean;
  /** 호출별 기록. ★ 작업 B 측정의 원천 데이터 */
  callLog: {
    kind: 'generate' | 'backcheck-gate' | 'backcheck-escalate';
    model: string;
    slots: number;
    tokens: number;
    thoughts: number;
    at: string;
  }[];
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * ★ 생성 문제의 sourceRef.
 *
 * ★ 왜 질문+정답의 해시인가
 *   같은 문제를 두 번 만들었을 때 **DB의 UNIQUE(source_id, source_ref) 가
 *   자동으로 막아준다.** 중복 판정이 놓쳐도 마지막 그물이 하나 더 있는 셈이다.
 *   R010의 OpenTDB 어댑터와 같은 방식이다 (makeSourceRef).
 */
export function makeGenRef(question: string, answer: string): string {
  return createHash('sha1')
    .update(`${normalizeAnswer(question)}|${normalizeAnswer(answer)}`)
    .digest('hex')
    .slice(0, 16);
}

function baseGenItem(slot: GenSlot): ProcessedItem {
  const mid = findMid(slot.midKey);
  return {
    sourceId: GEN_SOURCE_ID,
    // ★ 생성 실패한 슬롯도 기록해야 하므로 슬롯 식별자를 임시 ref 로 쓴다
    sourceRef: `slot:${slot.slotId}`,
    verdict: 'reject',
    rejectedAt: null,
    rejectReasons: [],
    source: {
      // ★ 생성 문제에는 원본이 없다. 대신 **요청 내용**을 남긴다.
      //   무엇을 요청해서 무엇이 나왔는지 대조할 수 있어야 한다 (C-2 검증).
      question: `[생성 요청] ${slot.majorNameKo} > ${slot.midNameKo} > ${slot.sub}`,
      correct: '',
      incorrect: [],
      category: slot.midNameKo,
      difficulty: '',
    },
    generated: null,
    gen: {
      midKey: slot.midKey,
      majorKey: mid?.major ?? '',
      sub: slot.sub,
      accessibility: 0,
      difficultyScore: 0,
      worthKnowing: 0,
      offCategory: false,
      offCategoryReason: null,
      promptVersion: GEN_PROMPT_VERSION,
    },
    ai: null,
    backcheck: null,
    rules: null,
    review: { status: 'pending', note: null },
    meta: {
      processModel: MODELS.processChain[0],
      backcheckModel: null,
      promptVersion: `${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`,
      processedAt: new Date().toISOString(),
      totalTokens: 0,
    },
  };
}

/** 1~5 점수를 DB의 easy/medium/hard 로 옮긴다 */
export function difficultyBucket(score: number): 'easy' | 'medium' | 'hard' {
  if (score <= 2) return 'easy';
  if (score <= 3) return 'medium';
  return 'hard';
}

/**
 * ★ 단계별 게이트의 승급 조건 (D-5).
 *
 *   싼 모델의 역검증 결과가 다음이면 상위 모델로 올린다.
 *     · 우리 정답 집합과 불일치 (틀렸을 수도, 문제가 애매할 수도 있다)
 *     · ambiguous=true
 *     · 맞혔지만 집합 밖 대안을 제시 (needsReview)
 *     · confidence 가 낮다
 *   맞히고 대안도 없고 확신도 높으면 → 상위 모델을 부르지 않는다. 이것이 절약분이다.
 */
function needsEscalation(judged: {
  reject: boolean;
  needsReview: boolean;
  result: { result: string; confidence: number };
}): boolean {
  if (judged.reject) return true;
  if (judged.needsReview) return true;
  return judged.result.confidence < 0.7;
}

export async function generateBatch(
  options: GenerateOptions,
): Promise<{ results: ProcessedItem[]; stats: GenerateStats }> {
  const log = options.log ?? ((): void => {});
  const { client } = options;

  const stats: GenerateStats = {
    requestedSlots: 0,
    llmSlots: 0,
    returned: 0,
    missing: 0,
    offCategory: 0,
    emptyGeneration: 0,
    backcheckRejected: 0,
    rulesRejected: 0,
    accepted: 0,
    escalated: 0,
    modelUsage: {},
    rejectReasons: {},
    tokens: { total: 0, prompt: 0, output: 0, thoughts: 0, calls: 0 },
    stoppedByRateLimit: false,
    callLog: [],
  };

  const results: ProcessedItem[] = [];

  type Accepted = { out: ProcessedItem; generated: AiGenerated };
  /** ★ 게이트에서 애매하다고 나온 것. 전 그룹에서 모아 마지막에 한 번 승급한다 */
  const pendingEscalation: Accepted[] = [];
  /** 역검증이 끝나 판정만 남은 것 */
  const settled: { out: ProcessedItem; generated: AiGenerated; judged: ReturnType<typeof judgeBackcheck> }[] = [];
  /** 생성에 실제로 쓴 모델. 역검증 체인에서 제외하려고 기억한다 */
  let lastGenModel: string = MODELS.processChain[0];

  // ── 중분류를 묶어 호출 단위를 만든다.
  //   ★ 한 호출에 여러 중분류를 넣는 이유는 무료 한도가 **호출 수**에 걸리기 때문이다.
  //     R010 실측: 4회 호출 / 18,236토큰에서 429 를 맞았다.
  //     건당 1회 호출로는 63개 중분류를 하루에 돌 수 없다.
  // ★ 슬롯을 직접 받은 경우: 호출당 슬롯 수로 잘라 나눈다.
  //   ★ 중분류 단위가 아니라 슬롯 단위로 자른다. 같은 중분류가 여러 호출에 걸쳐도 된다 —
  //     비교 실험에서는 소분류가 고정이므로 중분류 경계가 의미를 갖지 않는다.
  const slotGroups: GenSlot[][] = [];
  if (options.explicitSlots && options.explicitSlots.length > 0) {
    const perCall = Math.max(1, options.midsPerCall * options.perMid);
    for (let i = 0; i < options.explicitSlots.length; i += perCall) {
      slotGroups.push(options.explicitSlots.slice(i, i + perCall) as GenSlot[]);
    }
  } else {
    const groups: MidCategory[][] = [];
    for (let i = 0; i < options.mids.length; i += options.midsPerCall) {
      groups.push(options.mids.slice(i, i + options.midsPerCall) as MidCategory[]);
    }
    for (const group of groups) {
      slotGroups.push(buildSlots(group, options.perMid, options.subOffset ?? 0));
    }
  }

  for (const [gi, group] of slotGroups.entries()) {
    const slots = group;
    stats.requestedSlots += slots.length;

    // ── 1. 생성
    let genItems: GenItem[] = [];
    let genModel: string = MODELS.processChain[0];
    try {
      const r = await client.generateWithChain<{ items: GenItem[] }>(
        MODELS.processChain,
        buildGeneratePrompt(slots),
        GENERATE_SCHEMA,
        { maxOutputTokens: 16384 },
      );
      genItems = r.value.items ?? [];
      genModel = r.model;
      lastGenModel = r.model;
      bump(stats.modelUsage, r.model);
      stats.llmSlots += slots.length;
      stats.tokens.total += r.usage.total;
      stats.tokens.prompt += r.usage.prompt;
      stats.tokens.output += r.usage.output;
      stats.tokens.thoughts += r.usage.thoughts;
      stats.tokens.calls += 1;
      stats.callLog.push({
        kind: 'generate',
        model: r.model,
        slots: slots.length,
        tokens: r.usage.total,
        thoughts: r.usage.thoughts,
        at: new Date().toISOString(),
      });
      log(
        `[gen] ${gi + 1}/${slotGroups.length}번째 호출: 슬롯 ${slots.length}개 → ${genItems.length}건` +
          ` [${r.model}] (토큰 ${r.usage.total}, 사고 ${r.usage.thoughts})`,
      );
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetError) {
        stats.stoppedByRateLimit = err instanceof RateLimitError;
        log(`[gen] ★ 생성 중단: ${err.message}`);
        break;
      }
      throw err;
    }

    stats.returned += genItems.length;
    const bySlot = new Map(genItems.map((g) => [g.slotId, g]));
    const accepted: { out: ProcessedItem; generated: AiGenerated }[] = [];

    for (const slot of slots) {
      const g = bySlot.get(slot.slotId);
      const out = baseGenItem(slot);
      out.meta.processModel = genModel;

      if (!g) {
        // ★ 모델이 슬롯을 빠뜨렸다. 조용히 넘기지 않고 기록한다 (R010과 같은 원칙).
        out.rejectedAt = 'ai';
        out.rejectReasons = ['gen_missing_slot'];
        bump(stats.rejectReasons, 'gen_missing_slot');
        stats.missing += 1;
        results.push(out);
        continue;
      }

      out.gen!.accessibility = Number(g.accessibility) || 0;
      out.gen!.difficultyScore = Number(g.difficulty) || 0;
      out.gen!.worthKnowing = Number(g.worthKnowing) || 0;
      out.gen!.offCategory = Boolean(g.offCategory);
      out.gen!.offCategoryReason = g.offCategoryReason?.trim() || null;

      // ★ 모델이 "이 카테고리로는 못 만든다" 고 한 경우 (C-2)
      if (g.offCategory) {
        out.rejectedAt = 'ai';
        out.rejectReasons = ['off_category'];
        bump(stats.rejectReasons, 'off_category');
        stats.offCategory += 1;
        results.push(out);
        continue;
      }

      const display = (g.displayAnswer ?? '').trim();
      const raw = dedupeAnswers([display, ...(g.answers ?? []).map((a) => String(a).trim())]).filter(
        Boolean,
      );
      // ★ 형식이 틀린 변형만 떼어낸다. 문제 전체를 버리지 않는다 (근거는 rules.ts).
      const { kept: answers, dropped } = sanitizeVariants(display, raw);

      const generated: AiGenerated = {
        questionKo: (g.question ?? '').trim(),
        displayAnswer: (g.displayAnswer ?? '').trim(),
        answers,
        hintAnswer: (g.hintAnswer ?? '').trim() || null,
        // ★ 카테고리는 우리가 요청한 값이다. 모델 값을 쓰지 않는다 (C-2).
        //   화면 표시 계층은 대분류이므로 대분류 이름을 넣는다 (C-5).
        category: findMajor(out.gen!.majorKey)?.nameKo ?? slot.majorNameKo,
        difficulty: difficultyBucket(out.gen!.difficultyScore),
        explanation: (g.explanation ?? '').trim(),
        answerLang: (g.answerLang ?? 'ko').trim(),
      };
      out.generated = generated;
      if (dropped.length > 0) {
        // ★ 무엇을 떼어냈는지 남긴다. 조용히 버리지 않는다.
        out.review.note = `형식에 맞지 않는 표기 변형을 제외했다: ${dropped.join(', ')}`;
        bump(stats.rejectReasons, 'variant_dropped');
      }
      out.source.correct = generated.displayAnswer;
      out.source.difficulty = `접근성 ${out.gen!.accessibility} / 난이도 ${out.gen!.difficultyScore}`;
      out.ai = {
        convertible: true,
        uniqueAnswer: true,
        // ★ 기존 필드에는 접근성을 넣는다. 검수 시트가 이미 이 필드를 읽는다.
        krAccessible: out.gen!.accessibility,
        koreanTerm: generated.answerLang !== 'en',
        confidence: Number(g.confidence) || 0,
        rejectReason: null,
      };

      if (!generated.questionKo || !generated.displayAnswer || answers.length === 0) {
        out.rejectedAt = 'ai';
        out.rejectReasons = ['gen_empty'];
        bump(stats.rejectReasons, 'gen_empty');
        stats.emptyGeneration += 1;
        results.push(out);
        continue;
      }

      // ★ 진짜 sourceRef 로 바꾼다. 이제 질문과 정답이 있다.
      out.sourceRef = makeGenRef(generated.questionKo, generated.displayAnswer);
      accepted.push({ out, generated });
    }

    if (accepted.length === 0) {
      if (stats.stoppedByRateLimit) break;
      continue;
    }

    // ── 2. ★ 역검증 — 단계별 게이트 (D-5)
    //   (a) 싼 모델로 전부 한 번
    const gateChain: string[] = [MODELS.assist];
    let gateRaw: BackcheckRaw[] = [];
    let gateModel: string = MODELS.assist;
    try {
      const r = await client.generateWithChain<{ items: BackcheckRaw[] }>(
        gateChain,
        buildBackcheckPrompt(
          accepted.map((a) => ({ sourceRef: a.out.sourceRef, questionKo: a.generated.questionKo })),
        ),
        BACKCHECK_SCHEMA,
        { maxOutputTokens: 8192 },
      );
      gateRaw = r.value.items ?? [];
      gateModel = r.model;
      bump(stats.modelUsage, r.model);
      stats.tokens.total += r.usage.total;
      stats.tokens.prompt += r.usage.prompt;
      stats.tokens.output += r.usage.output;
      stats.tokens.thoughts += r.usage.thoughts;
      stats.tokens.calls += 1;
      stats.callLog.push({
        kind: 'backcheck-gate',
        model: r.model,
        slots: accepted.length,
        tokens: r.usage.total,
        thoughts: r.usage.thoughts,
        at: new Date().toISOString(),
      });
      log(`[gen] 역검증 1단계(싼 모델) ${accepted.length}건 [${r.model}] (토큰 ${r.usage.total})`);
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetError) {
        stats.stoppedByRateLimit = err instanceof RateLimitError;
        log(`[gen] ★ 역검증 중단: ${err.message}`);
        // ★ 역검증을 못 한 것을 accept 로 올리지 않는다 (R010과 같은 원칙).
        for (const a of accepted) {
          a.out.rejectedAt = 'backcheck';
          a.out.rejectReasons = ['backcheck_not_run'];
          bump(stats.rejectReasons, 'backcheck_not_run');
          results.push(a.out);
        }
        break;
      }
      throw err;
    }

    const gateByRef = new Map(gateRaw.map((b) => [b.sourceRef, b]));
    const escalate: typeof accepted = [];

    for (const a of accepted) {
      const raw = gateByRef.get(a.out.sourceRef);
      if (!raw) {
        // 게이트가 항목을 빠뜨렸으면 상위 모델로 올린다
        escalate.push(a);
        continue;
      }
      const judged = judgeBackcheck(raw, a.generated.answers);
      if (needsEscalation(judged)) {
        escalate.push(a);
      } else {
        a.out.meta.backcheckModel = gateModel;
        settled.push({ out: a.out, generated: a.generated, judged });
      }
    }
    log(`[gen] 게이트 통과 ${settled.length}건 / 상위 모델 승급 ${escalate.length}건`);

    //   (b) ★ 승급은 여기서 호출하지 않는다. 모아 두고 마지막에 한 번에 부른다.
    //
    // ★★ 왜 바꿨는가 (R011 실측으로 발견한 설계 오류)
    //   처음에는 그룹마다 승급 호출을 했다. 실측 결과 —
    //     생성 5회 + 게이트 5회 + 승급 3회 = 13회
    //   ★ 게이트 없이 상위 모델로 전량 역검증하면 생성 5 + 역검증 5 = 10회다.
    //     **호출 수가 오히려 늘었다** (1.3배). 목표는 1.2~1.5배였으니 아슬아슬하지만,
    //     ★ 승급 건수가 적을 때(그룹당 1~2건) 호출 하나를 통째로 쓰는 것이 낭비다.
    //   → 승급 대상을 전 그룹에서 모아 **마지막에 한 번** 부른다.
    //     그러면 생성 5 + 게이트 5 + 승급 1 = 11회 (1.1배)가 된다.
    //   ★ 토큰은 이미 절약된다. 게이트 모델이 상위 모델보다 훨씬 싸다.
    //     ★ 다만 무료 한도가 호출 수 기준인지 토큰 기준인지는 **확인 불가**다(D-034).
    //       그래서 둘 다 줄이는 방향으로 만들었다.
    pendingEscalation.push(...escalate);

    // ★ 상태 파일의 구간에 건수를 누적한다 (작업 B 원천 데이터)
    if (options.state) {
      const st = options.state as Parameters<typeof currentSegment>[0];
      const seg = currentSegment(st);
      seg.items = (seg.items ?? 0) + slots.length;
    }

    if (stats.stoppedByRateLimit) break;
    if (stats.llmSlots >= LIMITS.dailyItems) {
      log('[gen] 자체 건수 상한에 도달했다. 멈춘다.');
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ★ 승급 역검증 — 전 그룹에서 모인 애매한 것만 한 번에 (D-037)
  // ─────────────────────────────────────────────────────────────────────────
  if (pendingEscalation.length > 0 && !stats.stoppedByRateLimit) {
    const chain = pickBackcheckChain(lastGenModel);
    try {
      const r = await client.generateWithChain<{ items: BackcheckRaw[] }>(
        chain,
        buildBackcheckPrompt(
          pendingEscalation.map((a) => ({
            sourceRef: a.out.sourceRef,
            questionKo: a.generated.questionKo,
          })),
        ),
        BACKCHECK_SCHEMA,
        { maxOutputTokens: 8192 },
      );
      const upRaw = r.value.items ?? [];
      bump(stats.modelUsage, r.model);
      stats.escalated += pendingEscalation.length;
      stats.tokens.total += r.usage.total;
      stats.tokens.prompt += r.usage.prompt;
      stats.tokens.output += r.usage.output;
      stats.tokens.thoughts += r.usage.thoughts;
      stats.tokens.calls += 1;
      stats.callLog.push({
        kind: 'backcheck-escalate',
        model: r.model,
        slots: pendingEscalation.length,
        tokens: r.usage.total,
        thoughts: r.usage.thoughts,
        at: new Date().toISOString(),
      });
      log(`[gen] 역검증 2단계(상위 모델) ${pendingEscalation.length}건 [${r.model}] (토큰 ${r.usage.total})`);

      const upByRef = new Map(upRaw.map((b) => [b.sourceRef, b]));
      for (const a of pendingEscalation) {
        const raw = upByRef.get(a.out.sourceRef);
        a.out.meta.backcheckModel = r.model;
        if (!raw) {
          a.out.rejectedAt = 'backcheck';
          a.out.rejectReasons = ['backcheck_missing_item'];
          bump(stats.rejectReasons, 'backcheck_missing_item');
          stats.backcheckRejected += 1;
          results.push(a.out);
          continue;
        }
        settled.push({
          out: a.out,
          generated: a.generated,
          judged: judgeBackcheck(raw, a.generated.answers),
        });
      }
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetError) {
        stats.stoppedByRateLimit = err instanceof RateLimitError;
        log(`[gen] ★ 승급 역검증 중단: ${err.message}`);
        // ★ 승급 대상은 애매한 것들이다. 검증을 못 했으면 accept 로 올리지 않는다.
        for (const a of pendingEscalation) {
          a.out.rejectedAt = 'backcheck';
          a.out.rejectReasons = ['backcheck_escalation_not_run'];
          bump(stats.rejectReasons, 'backcheck_escalation_not_run');
          results.push(a.out);
        }
      } else {
        throw err;
      }
    }
  } else if (pendingEscalation.length > 0) {
    // 429 로 멈춘 상태에서는 승급 호출을 하지 않는다
    for (const a of pendingEscalation) {
      a.out.rejectedAt = 'backcheck';
      a.out.rejectReasons = ['backcheck_escalation_not_run'];
      bump(stats.rejectReasons, 'backcheck_escalation_not_run');
      results.push(a.out);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ★ 판정 + 규칙 검사 (무료. API 를 쓰지 않는다)
  // ─────────────────────────────────────────────────────────────────────────
  for (const s of settled) {
    s.out.backcheck = s.judged.result;
    if (s.judged.reject) {
      s.out.rejectedAt = 'backcheck';
      s.out.rejectReasons = [`backcheck_${s.judged.result.result}`];
      bump(stats.rejectReasons, `backcheck_${s.judged.result.result}`);
      stats.backcheckRejected += 1;
      results.push(s.out);
      continue;
    }

    const rules = checkRules(s.generated);
    s.out.rules = rules;
    if (!rules.pass) {
      s.out.rejectedAt = 'rules';
      s.out.rejectReasons = rules.reasons;
      for (const r of rules.reasons) bump(stats.rejectReasons, r);
      stats.rulesRejected += 1;
      results.push(s.out);
      continue;
    }

    s.out.verdict = 'accept';
    s.out.rejectedAt = null;
    if (s.judged.needsReview) {
      // ★ 이미 메모가 있으면(형식 변형 제외 등) 덮어쓰지 않고 덧붙인다
      s.out.review.note = s.out.review.note
        ? `${s.out.review.note} / ${s.judged.result.note}`
        : s.judged.result.note;
    }
    stats.accepted += 1;
    results.push(s.out);
  }

  return { results, stats };
}
