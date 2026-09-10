#!/usr/bin/env node
// =============================================================================
// Sonnet 세션 작업 흐름 (R014 작업 A-3 / Q-81 확정)
//
// ★★ 왜 이 스크립트가 생겼는가
//   R013 에서 Gemini 호출이 **하루에 1회만** 성공했다.
//   그 결과 50건 샘플이 전량 격리 상태로 남았다. 500건을 만들면 500건이 격리된다.
//   ★ 원인은 Gemini 가 **필수 경로**에 있었다는 것이다.
//   → Q-81 확정: 역검증을 Sonnet 이 전량 담당하고, Gemini 는 표본 감사로 내린다.
//
// ★★★ 역검증의 정직성을 코드로 보장한다 — 이 스크립트의 존재 이유다
//
//   역검증은 "질문만 보고 정답을 맞혀본다" 다.
//   ★ Sonnet 이 우리 정답을 보면서 답하면 역검증이 아니다. 그냥 동의하는 것이다.
//   ★ 그리고 판정(일치 여부)을 Sonnet 이 스스로 하면 "비슷하니 맞았다" 로 흐른다.
//
//   → 단계를 나눈다. **정답 노출과 판정을 코드가 통제한다.**
//
//     1) export     ★ 질문만 담은 파일을 만든다. **정답이 들어 있지 않다**
//     2) (Sonnet)   그 파일을 읽고 자기 답을 쓴다. 우리 정답을 모른 채로
//     3) backcheck  ★ 코드가 judgeBackcheck 로 비교한다. Gemini 경로와 **같은 함수**다
//     4) (Sonnet)   격리된 것 재판정 + 사실 검토
//     5) apply      pipeline-apply-decisions.mjs 가 최종 판정을 반영한다
//
// 사용법
//   node scripts/pipeline-sonnet.mjs export                  1단계 (질문만 내보낸다)
//   node scripts/pipeline-sonnet.mjs export --batch=R013-sample
//   node scripts/pipeline-sonnet.mjs backcheck --dry-run     3단계 (판정)
//   node scripts/pipeline-sonnet.mjs backcheck
//   node scripts/pipeline-sonnet.mjs status                  현재 어느 단계인가
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS, PROMPT_VERSION } from '../pipeline/dist/config.js';
import { judgeBackcheck } from '../pipeline/dist/process.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmd = args[0] ?? 'status';
const DRY = args.includes('--dry-run');
const optOf = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const BATCH = optOf('batch', null);

const OUT_DIR = path.join(ROOT, 'data/pipeline/sonnet');
const F_QUESTIONS = path.join(OUT_DIR, 'sonnet-backcheck-questions.json');
const F_ANSWERS = path.join(OUT_DIR, 'sonnet-backcheck-answers.json');

/** 처리된 배치를 읽는다 */
async function loadBatches() {
  const dir = path.join(ROOT, DATA_DIRS.processed);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
    if (BATCH && (d._meta?.batch ?? f) !== BATCH) continue;
    out.push({ file: path.join(dir, f), name: f, data: d });
  }
  return out;
}

/**
 * ★ Sonnet 역검증 대상인가.
 *
 * ★ 두 경우다 —
 *   (a) 역검증을 한 적이 없다 (backcheck === null)
 *   (b) 429 로 실행하지 못해 격리되었다 (skipped)
 * ★ 이미 역검증한 항목은 다시 하지 않는다. 이중 검증은 표본 감사의 일이다.
 */
function needsBackcheck(item) {
  if (!item.generated?.questionKo) return false;
  if (item.verdict === 'reject') return false;
  if (item.finalDecision) return false;
  if (item.backcheck && item.backcheck.result !== 'skipped') return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1단계 — 질문만 내보낸다
// ─────────────────────────────────────────────────────────────────────────────
if (cmd === 'export') {
  const batches = await loadBatches();
  const items = [];
  for (const b of batches) {
    for (const it of b.data.items ?? []) {
      if (!needsBackcheck(it)) continue;
      items.push({
        ref: it.sourceRef,
        batch: b.data._meta?.batch ?? b.name,
        // ★★ 질문만 담는다. displayAnswer / answers 를 절대 넣지 않는다.
        //   ★ 넣으면 역검증이 아니라 동의가 된다.
        //   ★ 카테고리도 담지 않는다. Gemini 역검증 프롬프트와 조건을 같게 유지한다.
        question: it.generated.questionKo,
      });
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const payload = {
    _meta: {
      purpose: '★ Sonnet 역검증 입력 - 질문만 있다. 정답은 들어 있지 않다',
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      count: items.length,
      instructions: [
        '★★ 이 파일에는 정답이 없다. 그것이 의도다.',
        '★ 질문만 보고 답을 맞혀 보고, 그 답을 answer 칸에 써라.',
        '★ 확신이 없으면 ambiguous=true 로 하고 alternatives 에 가능한 답들을 적어라.',
        '★★ 그리고 질문 문장 자체를 검토해 세 배열을 채워라 (p3 와 같은 항목) -',
        '  factualIssues   질문에 사실과 다른 서술이 있는가',
        '  uniquenessIssue 조건을 만족하는 답이 둘 이상인가 (한정어 누락)',
        '  spellingIssues  인명·작품명·표기가 틀렸는가',
        '★ 결과를 data/pipeline/sonnet/sonnet-backcheck-answers.json 에 써라.',
        '★★ 일치 여부를 스스로 판정하지 마라. 코드가 한다 (pipeline-sonnet.mjs backcheck).',
        '  ★ 근거: "비슷하니 맞았다" 로 흐르는 것을 막는다. Gemini 경로와 같은 함수로 비교한다.',
      ],
      answerFileFormat: {
        _meta: { answeredBy: 'claude-sonnet-5', answeredAt: '(ISO 시각)' },
        items: [
          {
            ref: '(질문 파일의 ref 를 그대로)',
            answer: '(질문만 보고 맞힌 답. 하나만)',
            ambiguous: false,
            alternatives: [],
            confidence: 0.9,
            factualIssues: [],
            uniquenessIssue: [],
            spellingIssues: [],
          },
        ],
      },
    },
    items,
  };
  if (!DRY) await writeFile(F_QUESTIONS, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log(`[sn] 역검증 대상 ${items.length}건`);
  const byBatch = {};
  for (const i of items) byBatch[i.batch] = (byBatch[i.batch] ?? 0) + 1;
  console.log(`[sn] 배치별: ${JSON.stringify(byBatch)}`);
  console.log(`[sn] ${DRY ? '(dry-run) ' : ''}질문 파일: ${path.relative(ROOT, F_QUESTIONS)}`);
  console.log('[sn] ★★ 이 파일에는 정답이 없다. 역검증의 정직성을 위한 것이다.');
  console.log('[sn] ★ 다음: Sonnet 세션이 docs/12-SONNET-SESSION.md 를 읽고 답을 채운다.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3단계 — 코드가 판정한다
// ─────────────────────────────────────────────────────────────────────────────
else if (cmd === 'backcheck') {
  let spec;
  try {
    spec = JSON.parse(await readFile(F_ANSWERS, 'utf8'));
  } catch {
    console.error(`[sn] ★ 답 파일이 없다: ${path.relative(ROOT, F_ANSWERS)}`);
    console.error('[sn] ★ Sonnet 세션이 먼저 답을 채워야 한다. docs/12-SONNET-SESSION.md 참조.');
    process.exit(1);
  }

  const byRef = new Map();
  for (const a of spec.items ?? []) {
    if (!a.ref) continue;
    if (typeof a.answer !== 'string' || a.answer.trim().length === 0) {
      console.error(`[sn] ★ answer 가 비어 있다 (ref=${a.ref}). 판정할 수 없다.`);
      process.exit(1);
    }
    byRef.set(a.ref, a);
  }
  const judgedBy = spec._meta?.answeredBy ?? 'claude-sonnet (모델 미기재)';
  console.log(`[sn] 답 ${byRef.size}건 / 판정자 ${judgedBy}`);

  const batches = await loadBatches();
  const stat = { pass: 0, quarantine: 0, questionIssue: 0, ruleDecision: 0, missing: 0 };
  const seen = new Set();

  for (const b of batches) {
    let changed = 0;
    for (const it of b.data.items ?? []) {
      if (!needsBackcheck(it)) continue;
      const a = byRef.get(it.sourceRef);
      if (!a) {
        stat.missing += 1;
        continue;
      }
      seen.add(it.sourceRef);

      // ★★ Gemini 경로와 **같은 함수**로 비교한다. 조건을 같게 유지한다
      const judged = judgeBackcheck(
        {
          sourceRef: it.sourceRef,
          answer: a.answer,
          ambiguous: Boolean(a.ambiguous),
          alternatives: Array.isArray(a.alternatives) ? a.alternatives : [],
          confidence: Number(a.confidence) || 0,
          factualIssues: Array.isArray(a.factualIssues) ? a.factualIssues : [],
          uniquenessIssue: Array.isArray(a.uniquenessIssue) ? a.uniquenessIssue : [],
          spellingIssues: Array.isArray(a.spellingIssues) ? a.spellingIssues : [],
        },
        it.generated.answers ?? [],
      );

      it.backcheck = judged.result;
      it.meta.backcheckModel = judgedBy;
      it.meta.backcheckBy = 'sonnet';

      if (judged.reject) {
        const reasons = [`backcheck_${judged.result.result}`];
        if (judged.hasQuestionIssue) reasons.push('question_issue');
        it.verdict = 'quarantine';
        it.rejectedAt = 'backcheck';
        it.rejectReasons = reasons;
        it.quarantine = {
          stage: 'backcheck',
          reasons,
          detail: judged.result.note ?? 'Sonnet 역검증 판정',
          judgedBy,
          judgedAt: new Date().toISOString(),
          confidence: judged.result.confidence,
          alternatives: judged.result.alternatives,
        };
        it.finalDecision = null;
        const note = `★ 격리 (backcheck/sonnet): ${it.quarantine.detail}`;
        it.review.note = it.review.note ? `${it.review.note} / ${note}` : note;
        if (judged.needsRuleDecision) {
          it.needsRuleDecision = true;
          stat.ruleDecision += 1;
        }
        if (judged.hasQuestionIssue) stat.questionIssue += 1;
        stat.quarantine += 1;
      } else {
        // ★ 역검증을 통과했다. ★ 그래도 accept 로 올리지 않는다 -
        //   ★ 최종 확정은 사실 검토를 거친 뒤 apply-decisions 가 한다 (Q-75).
        //   ★ 여기서 accept 로 올리면 사실 검토 단계를 건너뛴다.
        it.verdict = 'quarantine';
        it.rejectedAt = null;
        it.rejectReasons = ['awaiting_final_review'];
        it.quarantine = {
          stage: 'backcheck',
          reasons: ['awaiting_final_review'],
          detail: '★ 역검증은 통과했다. 사실 검토와 최종 확정을 기다린다 (Q-81)',
          judgedBy,
          judgedAt: new Date().toISOString(),
          confidence: judged.result.confidence,
        };
        it.finalDecision = null;
        if (judged.needsReview && judged.result.note) {
          it.review.note = it.review.note
            ? `${it.review.note} / ${judged.result.note}`
            : judged.result.note;
        }
        stat.pass += 1;
      }
      changed += 1;
    }

    if (changed > 0) {
      if (!DRY) {
        b.data._meta.sonnetBackcheckAt = new Date().toISOString();
        b.data._meta.sonnetBackcheckBy = judgedBy;
        b.data._meta.backcheckRan = true;
        b.data._meta.verifier = judgedBy;
        await writeFile(b.file, JSON.stringify(b.data, null, 2) + '\n', 'utf8');
      }
      console.log(`[sn] ${b.name}: ${changed}건`);
    }
  }

  const unused = [...byRef.keys()].filter((r) => !seen.has(r));
  console.log('');
  console.log('──────────────────────────────────────────');
  console.log(`[sn] 판정${DRY ? ' (dry-run)' : ''}`);
  console.log(`[sn]   역검증 통과    ${stat.pass}건  → ★ 사실 검토 대기 (아직 accept 아니다)`);
  console.log(`[sn]   격리           ${stat.quarantine}건  (질문 문장 문제 ${stat.questionIssue})`);
  console.log(`[sn]   규칙 결정 필요 ${stat.ruleDecision}건`);
  if (stat.missing > 0) console.log(`[sn] ★ 답이 없어 판정하지 못한 대상 ${stat.missing}건`);
  if (unused.length > 0) {
    console.log(`[sn] ★ 배치에서 찾지 못한 ref ${unused.length}건: ${unused.slice(0, 5).join(', ')}`);
  }
  console.log('[sn] ★ 다음: Sonnet 이 격리 항목을 재판정하고 사실 검토를 한다.');
  console.log('[sn]   node scripts/pipeline-quarantine.mjs --export');
}

// ─────────────────────────────────────────────────────────────────────────────
// status
// ─────────────────────────────────────────────────────────────────────────────
else if (cmd === 'status') {
  const batches = await loadBatches();
  let total = 0;
  let needBc = 0;
  let awaitingFinal = 0;
  let quarantined = 0;
  let accepted = 0;
  let decided = 0;
  for (const b of batches) {
    for (const it of b.data.items ?? []) {
      total += 1;
      if (it.finalDecision) decided += 1;
      if (it.verdict === 'accept') accepted += 1;
      if (needsBackcheck(it)) needBc += 1;
      if (it.rejectReasons?.includes('awaiting_final_review')) awaitingFinal += 1;
      else if (it.verdict === 'quarantine') quarantined += 1;
    }
  }
  console.log('══════════════════════════════════════════');
  console.log('■ Sonnet 작업 흐름 상태 (Q-81)');
  console.log('══════════════════════════════════════════');
  console.log(`전체 ${total}건${BATCH ? ` (배치 ${BATCH})` : ''}`);
  console.log(`  1단계 역검증 대기    ${needBc}건   → pipeline-sonnet.mjs export`);
  console.log(`  4단계 사실 검토 대기 ${awaitingFinal}건   → pipeline-quarantine.mjs --export`);
  console.log(`  4단계 재판정 대기    ${quarantined}건`);
  console.log(`  최종 확정됨          ${decided}건`);
  console.log(`  적재 대상 (accept)   ${accepted}건`);
} else {
  console.error(`알 수 없는 명령: ${cmd}`);
  console.error('가능한 값: export / backcheck / status');
  process.exit(1);
}
