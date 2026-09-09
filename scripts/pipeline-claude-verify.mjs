#!/usr/bin/env node
// =============================================================================
// Claude Code 생성분 → Gemini 역검증 (R012 작업 A-3)
//
// ★★ 자기 생성분을 자기가 검증하지 않는다. 그것은 검증이 아니다 (지시).
//   Claude Code 가 만든 105건을 **Gemini 가** 역검증한다.
//   반대 방향(Gemini 생성분 → Claude Code 검증)은 사람이 아닌 내가 직접 하고
//   그 결과를 파일로 넣는다 (pipeline-gemini-verify.mjs).
//
// ★ 검증 항목은 기존 그대로다 —
//   역검증(질문만 주고 답을 맞히게 한다) + 규칙 검사 3종 + 표기 변형 형식 정리.
//   ★ 새로 만들지 않는다. 조건이 달라지면 비교가 성립하지 않는다.
//
// 사용법
//   node scripts/pipeline-claude-verify.mjs
//   node scripts/pipeline-claude-verify.mjs --no-llm    역검증 없이 규칙 검사만
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS, LIMITS, MODELS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient, RateLimitError, BudgetError } from '../pipeline/dist/gemini.js';
import { findMajor, findMid } from '../pipeline/dist/categories.js';
import { GEN_SOURCE_ID, difficultyBucket, makeGenRef } from '../pipeline/dist/generate.js';
import { GEN_PROMPT_VERSION } from '../pipeline/dist/gen-prompt.js';
import { BACKCHECK_SCHEMA, buildBackcheckPrompt } from '../pipeline/dist/prompts.js';
import { judgeBackcheck } from '../pipeline/dist/process.js';
import { checkRules, dedupeAnswers, sanitizeVariants } from '../pipeline/dist/rules.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 환경변수 직접 주입 */
}

const args = process.argv.slice(2);
const NO_LLM = args.includes('--no-llm');
const BATCH = 15;

// ── 1. Claude Code 생성분 읽기
const genDir = path.join(ROOT, 'data/pipeline/claude-gen');
const files = (await readdir(genDir)).filter((f) => f.startsWith('part') && f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('[cv] 생성 파일이 없다: data/pipeline/claude-gen/part*.json');
  process.exit(1);
}

const raw = [];
for (const f of files) {
  const d = JSON.parse(await readFile(path.join(genDir, f), 'utf8'));
  for (const it of d.items ?? []) raw.push({ ...it, _file: f });
}
console.log(`[cv] 파일 ${files.length}개 / 생성분 ${raw.length}건`);

// ── 2. ProcessedItem 으로 변환 + 규칙 검사 (무료)
//   ★ Gemini 측과 정확히 같은 함수를 쓴다 (generate.ts 와 같은 순서)
const stats = {
  input: raw.length,
  emptyGeneration: 0,
  rulesRejected: 0,
  variantDropped: 0,
  backcheckRejected: 0,
  accepted: 0,
  rejectReasons: {},
  tokens: { total: 0, prompt: 0, output: 0, thoughts: 0, calls: 0 },
};
const bump = (k) => {
  stats.rejectReasons[k] = (stats.rejectReasons[k] ?? 0) + 1;
};

const items = [];
for (const g of raw) {
  // slotId 형식: midKey@sub#n
  const m = /^(.+?)@(.+?)#(\d+)$/.exec(g.slotId ?? '');
  if (!m) {
    console.error(`[cv] ★ slotId 형식이 잘못됐다: ${g.slotId}`);
    process.exit(1);
  }
  const [, midKey, sub] = m;
  const mid = findMid(midKey);
  if (!mid) {
    console.error(`[cv] ★ 없는 중분류: ${midKey}`);
    process.exit(1);
  }
  if (!mid.subs.includes(sub)) {
    console.error(`[cv] ★ ${midKey} 에 없는 소분류: ${sub}`);
    process.exit(1);
  }
  const major = findMajor(mid.major);

  const display = String(g.displayAnswer ?? '').trim();
  const merged = dedupeAnswers([display, ...(g.answers ?? []).map((a) => String(a).trim())]).filter(Boolean);
  const { kept: answers, dropped } = sanitizeVariants(display, merged);

  const generated = {
    questionKo: String(g.question ?? '').trim(),
    displayAnswer: display,
    answers,
    hintAnswer: String(g.hintAnswer ?? '').trim() || null,
    // ★ 카테고리는 우리가 지정한 값이다. 화면 표시 계층은 대분류다
    category: major?.nameKo ?? mid.major,
    difficulty: difficultyBucket(Number(g.difficulty) || 0),
    explanation: String(g.explanation ?? '').trim(),
    answerLang: String(g.answerLang ?? 'ko').trim(),
  };

  const out = {
    sourceId: GEN_SOURCE_ID,
    sourceRef: makeGenRef(generated.questionKo, generated.displayAnswer),
    verdict: 'reject',
    rejectedAt: null,
    rejectReasons: [],
    source: {
      question: `[생성 요청] ${major?.nameKo ?? ''} > ${mid.nameKo} > ${sub}`,
      correct: generated.displayAnswer,
      incorrect: [],
      category: mid.nameKo,
      difficulty: `접근성 ${g.accessibility} / 난이도 ${g.difficulty} / 알가치 ${g.worthKnowing}`,
    },
    generated,
    gen: {
      midKey,
      majorKey: mid.major,
      sub,
      accessibility: Number(g.accessibility) || 0,
      difficultyScore: Number(g.difficulty) || 0,
      worthKnowing: Number(g.worthKnowing) || 0,
      offCategory: Boolean(g.offCategory),
      offCategoryReason: g.offCategoryReason?.trim() || null,
      promptVersion: GEN_PROMPT_VERSION,
    },
    ai: {
      convertible: true,
      uniqueAnswer: true,
      krAccessible: Number(g.accessibility) || 0,
      koreanTerm: generated.answerLang !== 'en',
      confidence: Number(g.confidence) || 0,
      rejectReason: null,
    },
    backcheck: null,
    rules: null,
    review: { status: 'pending', note: null },
    meta: {
      // ★ 생성자를 기록한다. 비교 실험의 핵심 정보다
      processModel: 'claude-code',
      backcheckModel: null,
      promptVersion: `${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`,
      processedAt: new Date().toISOString(),
      totalTokens: 0,
    },
  };

  if (dropped.length > 0) {
    out.review.note = `형식에 맞지 않는 표기 변형을 제외했다: ${dropped.join(', ')}`;
    stats.variantDropped += 1;
  }

  if (!generated.questionKo || !generated.displayAnswer || answers.length === 0) {
    out.rejectedAt = 'ai';
    out.rejectReasons = ['gen_empty'];
    bump('gen_empty');
    stats.emptyGeneration += 1;
    items.push(out);
    continue;
  }
  items.push(out);
}

const pending = items.filter((i) => i.rejectedAt === null);
console.log(`[cv] 변환 완료. 역검증 대상 ${pending.length}건`);

// ── 3. Gemini 역검증
if (!NO_LLM && pending.length > 0) {
  const state = await loadState(ROOT);
  const gate = checkGate(state);
  console.log(`[cv] 오늘(${state.day}) 토큰 ${state.tokens} / 호출 ${state.calls}회`);
  if (!gate.ok) {
    console.error(`[cv] ★ 역검증을 시작하지 않는다 — ${gate.detail}`);
    process.exit(0);
  }

  const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
  // ★ Claude Code 가 만든 것이므로 Gemini 체인 전체를 쓸 수 있다.
  //   자기 생성분을 자기가 검증하는 문제가 없다.
  const chain = [...MODELS.backcheckChain];

  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    try {
      const r = await client.generateWithChain(
        chain,
        buildBackcheckPrompt(
          chunk.map((a) => ({ sourceRef: a.sourceRef, questionKo: a.generated.questionKo })),
        ),
        BACKCHECK_SCHEMA,
        { maxOutputTokens: 8192 },
      );
      const byRef = new Map((r.value.items ?? []).map((b) => [b.sourceRef, b]));
      stats.tokens.total += r.usage.total;
      stats.tokens.prompt += r.usage.prompt;
      stats.tokens.output += r.usage.output;
      stats.tokens.thoughts += r.usage.thoughts;
      stats.tokens.calls += 1;
      console.log(
        `[cv] 역검증 ${i + 1}~${i + chunk.length}/${pending.length} [${r.model}] (토큰 ${r.usage.total})`,
      );

      for (const a of chunk) {
        a.meta.backcheckModel = r.model;
        const bc = byRef.get(a.sourceRef);
        if (!bc) {
          a.rejectedAt = 'backcheck';
          a.rejectReasons = ['backcheck_missing_item'];
          bump('backcheck_missing_item');
          stats.backcheckRejected += 1;
          continue;
        }
        const judged = judgeBackcheck(bc, a.generated.answers);
        a.backcheck = judged.result;
        a._judged = judged;
      }
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetError) {
        console.log(`[cv] ★ 역검증 중단: ${err.message}`);
        for (const a of chunk) {
          if (!a.backcheck) {
            a.rejectedAt = 'backcheck';
            a.rejectReasons = ['backcheck_not_run'];
            bump('backcheck_not_run');
          }
        }
        break;
      }
      throw err;
    }
  }
  closeSegment(state, false);
  await saveState(ROOT, state);
}

// ── 4. 판정 + 규칙 검사
for (const a of items) {
  if (a.rejectedAt !== null) continue;

  const judged = a._judged;
  delete a._judged;
  if (judged?.reject) {
    a.rejectedAt = 'backcheck';
    a.rejectReasons = [`backcheck_${judged.result.result}`];
    bump(`backcheck_${judged.result.result}`);
    stats.backcheckRejected += 1;
    continue;
  }

  const rules = checkRules(a.generated);
  a.rules = rules;
  if (!rules.pass) {
    a.rejectedAt = 'rules';
    a.rejectReasons = rules.reasons;
    for (const r of rules.reasons) bump(r);
    stats.rulesRejected += 1;
    continue;
  }

  a.verdict = 'accept';
  a.rejectedAt = null;
  if (judged?.needsReview) {
    a.review.note = a.review.note
      ? `${a.review.note} / ${judged.result.note}`
      : judged.result.note;
  }
  stats.accepted += 1;
}

// ── 5. 저장
const dir = path.join(ROOT, DATA_DIRS.processed);
await mkdir(dir, { recursive: true });
const outFile = path.join(dir, '2026-09-10-compare-claude.json');
await writeFile(
  outFile,
  JSON.stringify(
    {
      _meta: {
        sourceId: GEN_SOURCE_ID,
        batch: 'R012-compare-claude',
        kind: 'compare',
        // ★ 생성자와 검증자를 명시한다. 교차 검증의 증거다
        generator: 'claude-code',
        verifier: 'gemini',
        processModel: 'claude-code',
        backcheckModel: MODELS.backcheckChain[0],
        promptVersion: `${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`,
        slotFile: 'data/pipeline/compare-slots.json',
        perSlot: 5,
        generatedAt: new Date().toISOString(),
        counts: {
          requestedSlots: stats.input,
          llmSlots: stats.input,
          returned: stats.input,
          missing: 0,
          offCategory: items.filter((i) => i.gen.offCategory).length,
          emptyGeneration: stats.emptyGeneration,
          backcheckRejected: stats.backcheckRejected,
          rulesRejected: stats.rulesRejected,
          accepted: stats.accepted,
          variantDropped: stats.variantDropped,
        },
        rejectReasons: stats.rejectReasons,
        tokens: stats.tokens,
      },
      items,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('\n──────────────────────────────────────────');
console.log(`[cv] 입력 ${stats.input} / 빈 생성 ${stats.emptyGeneration}`);
console.log(`[cv] 역검증 탈락 ${stats.backcheckRejected} / 규칙 탈락 ${stats.rulesRejected}`);
console.log(`[cv] 표기 변형 일부 제외 ${stats.variantDropped}건`);
console.log(`[cv] ★ 통과 ${stats.accepted}건 (${((stats.accepted / stats.input) * 100).toFixed(1)}%)`);
console.log(`[cv] 탈락 사유: ${JSON.stringify(stats.rejectReasons)}`);
console.log(`[cv] 역검증 토큰 ${stats.tokens.total} / 호출 ${stats.tokens.calls}회`);
console.log(`[cv] 저장: ${path.relative(ROOT, outFile)}`);
