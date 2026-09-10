#!/usr/bin/env node
// =============================================================================
// Sonnet 세션의 최종 판정을 배치에 반영한다 (R013 작업 B-1 재판정 경로)
//
// ★★ 이 스크립트가 **유일한 폐기 경로**다.
//   Q-75 확정 — Gemini 와 규칙 검사는 버릴 권한이 없다. 격리만 한다.
//   ★ verdict='reject' 가 되는 것은 여기뿐이다.
//
// ★ 입력 파일을 두 개 본다. 앞의 것이 있으면 그것을 쓴다.
//     1) data/pipeline/quarantine/sonnet-decisions.json   ★ Sonnet 이 새로 쓴 것
//     2) data/pipeline/quarantine/quarantine-decisions.json  (서식에 직접 채운 경우)
//   ★ 근거 — 12-SONNET-SESSION.md 는 서식을 덮어쓰지 말라고 지시한다.
//     그러나 서식에 직접 채운 경우도 받아야 실수로 작업이 사라지지 않는다.
//
// 사용법
//   node scripts/pipeline-apply-decisions.mjs --dry-run
//   node scripts/pipeline-apply-decisions.mjs
//   node scripts/pipeline-apply-decisions.mjs --file=<경로>
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const FILE_ARG = process.argv.find((a) => a.startsWith('--file='))?.slice(7);

const CANDIDATES = FILE_ARG
  ? [FILE_ARG]
  : ['data/pipeline/quarantine/sonnet-decisions.json', 'data/pipeline/quarantine/quarantine-decisions.json'];

let specFile = null;
let spec = null;
for (const c of CANDIDATES) {
  try {
    spec = JSON.parse(await readFile(path.join(ROOT, c), 'utf8'));
    specFile = c;
    break;
  } catch {
    /* 다음 후보 */
  }
}
if (!spec) {
  console.error('[ad] ★ 판정 파일이 없다. 찾은 경로:');
  for (const c of CANDIDATES) console.error(`      ${c}`);
  console.error('[ad] ★ 먼저 node scripts/pipeline-quarantine.mjs --export 로 서식을 만들고');
  console.error('[ad]   Sonnet 세션이 채운 결과를 sonnet-decisions.json 으로 두어야 한다.');
  process.exit(1);
}
console.log(`[ad] 판정 파일: ${specFile}`);

const VALID = new Set(['pass', 'drop', 'needsRuleDecision']);
const byRef = new Map();
let unjudged = 0;

for (const d of spec.decisions ?? []) {
  if (d.verdict === null || d.verdict === undefined || d.verdict === '') {
    unjudged += 1;
    continue;
  }
  // ★ 알 수 없는 판정값을 조용히 넘기지 않는다. 멈춘다
  if (!VALID.has(d.verdict)) {
    console.error(`[ad] ★ 알 수 없는 판정값 "${d.verdict}" (ref=${d.ref})`);
    console.error('[ad]   ★ pass / drop / needsRuleDecision 셋 중 하나여야 한다.');
    process.exit(1);
  }
  // ★ 근거 없는 판정을 받지 않는다. R010 오탈락 사태가 근거 없는 자동 판정이었다
  if (!d.reason || String(d.reason).trim().length < 5) {
    console.error(`[ad] ★ reason 이 비어 있다 (ref=${d.ref}, verdict=${d.verdict})`);
    console.error('[ad]   ★ 근거 없는 판정은 받지 않는다.');
    process.exit(1);
  }
  if (d.verdict === 'needsRuleDecision' && !d.ruleQuestion) {
    console.error(`[ad] ★ needsRuleDecision 인데 ruleQuestion 이 없다 (ref=${d.ref})`);
    console.error('[ad]   ★ 건우가 답할 수 있는 질문이 있어야 결정으로 올릴 수 있다.');
    process.exit(1);
  }
  byRef.set(d.ref, d);
}

console.log(`[ad] 판정 ${byRef.size}건 / 미판정 ${unjudged}건`);
if ((spec.unjudged ?? []).length > 0) {
  console.log(`[ad] ★ 판정자가 밝힌 미판정 ${spec.unjudged.length}건:`);
  for (const u of spec.unjudged) console.log(`      ${u.ref} — ${u.why}`);
}

const decidedBy = spec._meta?.decidedBy ?? 'claude-sonnet (모델 미기재)';
const decidedAt = spec._meta?.decidedAt ?? new Date().toISOString();

const dir = path.join(ROOT, DATA_DIRS.processed);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

const seen = new Set();
const stat = { pass: 0, drop: 0, needsRuleDecision: 0, answersAdded: 0 };
const ruleQuestions = [];

for (const f of files) {
  const file = path.join(dir, f);
  const batch = JSON.parse(await readFile(file, 'utf8'));
  let changed = 0;

  for (const item of batch.items ?? []) {
    const d = byRef.get(item.sourceRef);
    if (!d) continue;
    seen.add(item.sourceRef);

    item.finalDecision = {
      verdict: d.verdict,
      reason: d.reason,
      decidedBy,
      decidedAt,
      addAnswers: d.addAnswers?.length ? d.addAnswers : undefined,
    };

    if (d.verdict === 'pass') {
      item.verdict = 'accept';
      item.rejectedAt = null;
      item.needsRuleDecision = false;
      // ★ 표기 변형을 추가한다. 중복은 넣지 않는다
      if (d.addAnswers?.length && item.generated) {
        const set = new Set(item.generated.answers ?? []);
        for (const a of d.addAnswers) {
          if (!set.has(a)) {
            set.add(a);
            stat.answersAdded += 1;
          }
        }
        item.generated.answers = [...set];
      }
      stat.pass += 1;
    } else if (d.verdict === 'drop') {
      // ★★ 폐기는 여기서만 일어난다
      item.verdict = 'reject';
      item.rejectedAt = item.quarantine?.stage === 'dupe' || item.quarantine?.stage === 'select'
        ? null
        : (item.quarantine?.stage ?? item.rejectedAt);
      item.needsRuleDecision = false;
      stat.drop += 1;
    } else {
      // ★ 규칙 결정 대기. 적재하지 않는다 — verdict 를 quarantine 으로 둔다
      item.verdict = 'quarantine';
      item.needsRuleDecision = true;
      stat.needsRuleDecision += 1;
      ruleQuestions.push({
        ref: item.sourceRef,
        q: item.generated?.questionKo ?? '',
        a: item.generated?.displayAnswer ?? '',
        reason: d.reason,
        ruleQuestion: d.ruleQuestion,
      });
    }

    const note = `★ 최종 확정 (${d.verdict}, ${decidedBy}): ${d.reason}`;
    item.review.note = item.review.note ? `${item.review.note} / ${note}` : note;
    changed += 1;
  }

  if (changed > 0) {
    if (!DRY) {
      batch._meta.decisionsAppliedAt = new Date().toISOString();
      batch._meta.decisionsAppliedBy = decidedBy;
      await writeFile(file, JSON.stringify(batch, null, 2) + '\n', 'utf8');
    }
    console.log(`[ad] ${f}: ${changed}건`);
  }
}

// ★ 배치에 없는 ref 를 조용히 넘기지 않는다
const missing = [...byRef.keys()].filter((r) => !seen.has(r));
if (missing.length > 0) {
  console.error('');
  console.error(`[ad] ★★ 배치에서 찾지 못한 ref ${missing.length}건:`);
  for (const m of missing) console.error(`      ${m}`);
  console.error('[ad] ★ 판정 파일의 ref 가 틀렸거나 배치가 지워졌다. 확인이 필요하다.');
}

console.log('');
console.log('──────────────────────────────────────────');
console.log(`[ad] 반영 결과${DRY ? ' (dry-run — 저장하지 않았다)' : ''}`);
console.log(`[ad]   pass              ${stat.pass}건  → verdict=accept (적재 대상)`);
console.log(`[ad]   drop              ${stat.drop}건  → ★ verdict=reject (여기서만 폐기된다)`);
console.log(`[ad]   needsRuleDecision ${stat.needsRuleDecision}건  → ★ 격리 유지. 건우 결정 대기`);
console.log(`[ad]   정답 표기 추가    ${stat.answersAdded}개`);

if (ruleQuestions.length > 0) {
  console.log('');
  console.log('★★ 건우 결정이 필요한 항목:');
  for (const r of ruleQuestions) {
    console.log(`  [${r.ref}] ${r.a}`);
    console.log(`     Q. ${r.q}`);
    console.log(`     판정 근거: ${r.reason}`);
    console.log(`     ★ 규칙 질문: ${r.ruleQuestion}`);
  }
}
if (missing.length > 0) process.exit(1);
