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
// ★★ R013 에서 입력·출력 경로를 옵션으로 뺐다.
//   근거 — R013 의 50건 샘플을 R012 의 105건과 같은 파일에 섞으면
//   ★ "p3 프롬프트가 무엇을 더 잡았는가" 를 회차별로 비교할 수 없다.
//   ★ 검증 로직은 한 글자도 바꾸지 않는다. 로직을 복제하면 두 벌이 갈라진다.
//
// 사용법
//   node scripts/pipeline-claude-verify.mjs
//   node scripts/pipeline-claude-verify.mjs --no-llm    역검증 없이 규칙 검사만
//   node scripts/pipeline-claude-verify.mjs --dir=data/pipeline/claude-gen/r013 \
//        --out=2026-09-10-r013-sample.json --batch=R013-sample
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
const optOf = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
// ★ 기본값은 R012 그대로다. 옵션을 주지 않으면 동작이 변하지 않는다
const GEN_DIR = optOf('dir', 'data/pipeline/claude-gen');
const OUT_NAME = optOf('out', '2026-09-10-compare-claude.json');
const BATCH_NAME = optOf('batch', 'R012-compare-claude');

// ── 1. Claude Code 생성분 읽기
const genDir = path.join(ROOT, GEN_DIR);
const files = (await readdir(genDir)).filter((f) => f.startsWith('part') && f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`[cv] 생성 파일이 없다: ${GEN_DIR}/part*.json`);
  process.exit(1);
}
console.log(`[cv] 입력 디렉터리: ${GEN_DIR}`);

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
  // ★ p3: 질문 문장 문제로 격리된 건수
  questionIssues: 0,
  // ★ 규칙 충돌로 Opus 판단이 필요한 건수
  ruleDecisions: 0,
  rejectReasons: {},
  tokens: { total: 0, prompt: 0, output: 0, thoughts: 0, calls: 0 },
};
const bump = (k) => {
  stats.rejectReasons[k] = (stats.rejectReasons[k] ?? 0) + 1;
};

/**
 * ★★ 격리한다. 폐기하지 않는다 (R013 / Q-75).
 *   ★ Gemini 가 문제를 표시한 것이고 최종 확정은 Sonnet 이 한다.
 */
function quarantine(out, record) {
  out.verdict = 'quarantine';
  out.rejectedAt = record.stage;
  out.rejectReasons = record.reasons;
  out.quarantine = record;
  out.finalDecision = null;
  const note = `★ 격리 (${record.stage}): ${record.detail}`;
  out.review.note = out.review.note ? `${out.review.note} / ${note}` : note;
}

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
    quarantine(out, {
      stage: 'ai',
      reasons: ['gen_empty'],
      detail: '★ 생성 결과의 질문이나 정답이 비어 있다',
      judgedBy: 'pipeline',
      judgedAt: new Date().toISOString(),
    });
    bump('gen_empty');
    stats.emptyGeneration += 1;
    items.push(out);
    continue;
  }
  items.push(out);
}

const pending = items.filter((i) => i.rejectedAt === null);
console.log(`[cv] 변환 완료. 역검증 대상 ${pending.length}건`);

// ★ 게이트가 막았는가. 막혔으면 전량을 격리하고 그 사실을 배치 메타에 남긴다
let gateBlocked = null;

// ── 3. Gemini 역검증
if (!NO_LLM && pending.length > 0) {
  const state = await loadState(ROOT);
  const gate = checkGate(state);
  console.log(`[cv] 오늘(${state.day}) 토큰 ${state.tokens} / 호출 ${state.calls}회`);
  if (!gate.ok) {
    // ★★ 여기서 process.exit 하지 않는다 (R013 수정).
    //   ★ 근거 — 그냥 나가면 변환 결과가 저장되지 않아 다음 실행에서 처음부터 다시 한다.
    //     ★ 더 나쁜 것은, 이전 실행이 남긴 잘못된 배치 파일이 디스크에 그대로 남는 것이다.
    //   ★ 그래서 **전부 격리한 배치를 저장한다.** 상태를 정직하게 남기는 쪽을 고른다.
    console.error(`[cv] ★ 역검증을 시작하지 않는다 — ${gate.detail}`);
    console.error('[cv] ★ 전량을 backcheck_not_run 으로 격리해 저장한다. accept 로 올리지 않는다.');
    gateBlocked = gate.detail;
  } else {

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
          quarantine(a, {
            stage: 'backcheck',
            reasons: ['backcheck_missing_item'],
            detail: '★ 모델이 이 항목의 역검증 결과를 돌려주지 않았다',
            judgedBy: 'pipeline',
            judgedAt: new Date().toISOString(),
          });
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
            quarantine(a, {
              stage: 'backcheck',
              reasons: ['backcheck_not_run'],
              detail: '★ 429 등으로 역검증을 실행하지 못했다. 검증 없이 통과시키지 않는다',
              judgedBy: 'pipeline',
              judgedAt: new Date().toISOString(),
            });
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

  // ★★ 안전망 — 429 로 루프를 break 하면 **뒤 청크는 손도 대지 않은 채 남는다.**
  //   ★ R013 실측으로 발견한 결함이다 —
  //     50건을 15건씩 나눠 돌리다 첫 청크에서 429 를 맞았고,
  //     ★ 나머지 35건이 **역검증 없이 accept 로 통과했다.**
  //   ★ catch 블록은 현재 청크만 격리한다. 그것으로는 부족하다.
  //   ★ 원칙은 이 스크립트가 스스로 적어 둔 그대로다 —
  //     "검증 없이 통과시키지 않는다."
  let notRun = 0;
  for (const a of items) {
    if (a.rejectedAt !== null) continue;
    if (a.backcheck !== null || a._judged) continue;
    quarantine(a, {
      stage: 'backcheck',
      reasons: ['backcheck_not_run'],
      detail: gateBlocked
        ? `★ 역검증을 시작조차 하지 못했다 — ${gateBlocked}. 검증 없이 통과시키지 않는다`
        : '★ 역검증이 아예 실행되지 않았다 (429 로 중단된 뒤 남은 청크). 검증 없이 통과시키지 않는다',
      judgedBy: 'pipeline',
      judgedAt: new Date().toISOString(),
    });
    bump('backcheck_not_run');
    notRun += 1;
  }
  if (notRun > 0) {
    console.log(`[cv] ★★ 역검증이 실행되지 않은 ${notRun}건을 격리했다. accept 로 올리지 않았다.`);
    stats.backcheckRejected += notRun;
  }
} else {
  // ★ --no-llm 은 규칙 검사만 보는 모드다. 그 산출물을 검증된 것으로 오인하면 안 된다
  console.log('[cv] ★★ --no-llm — 역검증을 하지 않았다. 이 배치를 적재 대상으로 쓰지 말 것.');
}

// ── 4. 판정 + 규칙 검사
for (const a of items) {
  // ★★ 규칙 검사는 API 를 쓰지 않는다. 그래서 격리된 항목에도 **기록만은 남긴다** (R013).
  //   ★ 근거 — 429 로 역검증이 막힌 날 규칙 검사 결과까지 함께 잃었다.
  //     ★ 공짜로 얻을 수 있는 정보를 버리면 Sonnet 이 재판정할 때 근거가 줄어든다.
  //   ★ 단 verdict 는 바꾸지 않는다. 격리 사유는 먼저 걸린 단계의 것이다.
  if (a.rejectedAt !== null) {
    if (a.rules === null && a.generated?.questionKo) a.rules = checkRules(a.generated);
    continue;
  }

  const judged = a._judged;
  delete a._judged;
  if (judged?.reject) {
    const reasons = [`backcheck_${judged.result.result}`];
    if (judged.hasQuestionIssue) reasons.push('question_issue');
    quarantine(a, {
      stage: 'backcheck',
      reasons,
      detail: judged.result.note ?? '역검증 판정',
      judgedBy: a.meta.backcheckModel ?? 'gemini',
      judgedAt: new Date().toISOString(),
      confidence: judged.result.confidence,
      alternatives: judged.result.alternatives,
    });
    if (judged.needsRuleDecision) {
      a.needsRuleDecision = true;
      stats.ruleDecisions += 1;
    }
    for (const r of reasons) bump(r);
    stats.backcheckRejected += 1;
    if (judged.hasQuestionIssue) stats.questionIssues += 1;
    continue;
  }

  const rules = checkRules(a.generated);
  a.rules = rules;
  if (!rules.pass) {
    quarantine(a, {
      stage: 'rules',
      reasons: rules.reasons,
      detail: `규칙 검사 실패: ${rules.reasons.join(', ')}`,
      judgedBy: 'rules(코드)',
      judgedAt: new Date().toISOString(),
    });
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
const outFile = path.join(dir, OUT_NAME);
await writeFile(
  outFile,
  JSON.stringify(
    {
      _meta: {
        sourceId: GEN_SOURCE_ID,
        batch: BATCH_NAME,
        kind: 'compare',
        // ★ 생성자와 검증자를 명시한다. 교차 검증의 증거다
        generator: 'claude-code',
        verifier: NO_LLM ? '없음 (--no-llm)' : 'gemini',
        // ★ 이 배치가 실제로 역검증을 거쳤는가. 적재 판단의 전제다
        backcheckRan: !NO_LLM && gateBlocked === null,
        gateBlocked,
        processModel: 'claude-code',
        backcheckModel: MODELS.backcheckChain[0],
        promptVersion: `${PROMPT_VERSION}+${GEN_PROMPT_VERSION}`,
        genDir: GEN_DIR,
        generatedAt: new Date().toISOString(),
        counts: {
          questionIssues: stats.questionIssues,
          ruleDecisions: stats.ruleDecisions,
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
console.log(`[cv] ★★ 질문 문장 문제로 격리 ${stats.questionIssues}건 (p3 신규)`);
console.log(`[cv] ★ 규칙 충돌(Opus 판단 필요) ${stats.ruleDecisions}건`);
console.log(`[cv] ★ 통과 ${stats.accepted}건 (${((stats.accepted / stats.input) * 100).toFixed(1)}%)`);
console.log('[cv] ★ 격리된 것은 버리지 않았다. verdict=quarantine 이고 Sonnet 확정 대기다');
console.log(`[cv] 탈락 사유: ${JSON.stringify(stats.rejectReasons)}`);
console.log(`[cv] 역검증 토큰 ${stats.tokens.total} / 호출 ${stats.tokens.calls}회`);
if (gateBlocked) {
  console.log(`[cv] ★★ 역검증을 실행하지 못했다 — ${gateBlocked}`);
  console.log('[cv] ★ 이 배치의 accept 는 0건이어야 한다. 그렇지 않으면 결함이다.');
}
console.log(`[cv] 저장: ${path.relative(ROOT, outFile)}`);
