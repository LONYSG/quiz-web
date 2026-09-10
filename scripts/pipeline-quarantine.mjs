#!/usr/bin/env node
// =============================================================================
// 격리된 문제 조회 (R013 작업 B-1)
//
// ★★ 건우가 "이거 왜 버렸어?" 를 확인할 수 있어야 한다 (지시).
//   ★ 격리된 것은 **버린 것이 아니다.** verdict='quarantine' 이고 Sonnet 확정 대기다.
//
// ★ API 를 호출하지 않는다. 저장된 파일만 읽는다.
//
// 사용법
//   node scripts/pipeline-quarantine.mjs                     전체 요약 + 경고
//   node scripts/pipeline-quarantine.mjs --list              격리된 것 전부 나열
//   node scripts/pipeline-quarantine.mjs --stage backcheck   단계로 걸러 본다
//   node scripts/pipeline-quarantine.mjs --reason question_issue
//   node scripts/pipeline-quarantine.mjs --rule-decision     ★ 규칙 충돌만
//   node scripts/pipeline-quarantine.mjs --export            ★ Sonnet 세션용 파일로 내보낸다
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';
import { categoryPath } from '../pipeline/dist/categories.js';
import { detectOverFiltering, formatAlerts } from '../pipeline/dist/quarantine.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const LIST = args.includes('--list');
const EXPORT = args.includes('--export');
const RULE_ONLY = args.includes('--rule-decision');
const STAGE = opt('--stage', '');
const REASON = opt('--reason', '');
const FILES = (opt('--files', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

const dir = path.join(ROOT, DATA_DIRS.processed);
let files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
if (FILES.length > 0) files = files.filter((f) => FILES.includes(f));

const all = [];
for (const f of files) {
  const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  for (const i of d.items ?? []) all.push({ ...i, _file: f, _batch: d._meta?.batch ?? f });
}

// ★ 배치별로 묶어 둔다. 과다 필터링 감지의 단위는 배치다
const batches = new Map();
for (const i of all) {
  const k = i._batch;
  if (!batches.has(k)) batches.set(k, []);
  batches.get(k).push(i);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 전체 상황 + 과다 필터링 감지
// ─────────────────────────────────────────────────────────────────────────────
const report = detectOverFiltering(all);

console.log('══════════════════════════════════════════');
console.log('■ 격리 현황');
console.log('══════════════════════════════════════════');
console.log(`파일 ${files.length}개 / 전체 ${report.total}건`);
console.log(`  통과      ${report.accepted}건`);
console.log(`  ★ 격리   ${report.quarantined}건  (★ 버린 것이 아니다. Sonnet 확정 대기)`);
console.log(`  최종 폐기 ${all.filter((i) => i.verdict === 'reject').length}건`);
console.log(`  ★ 규칙 충돌(Opus 판단 필요) ${report.needsRuleDecision}건`);
console.log('');
console.log(`단계별 격리: ${JSON.stringify(report.byStage)}`);
console.log(`사유별:     ${JSON.stringify(report.byReason)}`);
console.log('');
for (const line of formatAlerts(report)) console.log(line);

// ─────────────────────────────────────────────────────────────────────────────
// ★★ 배치별 감지 (R013 실측으로 추가)
//
//   ★ 왜 필요한가 — 전체 합산만 보면 **깨진 배치가 묻힌다.**
//     ★ 실측: R013 의 50건 배치가 100% 격리되었는데,
//       전체 530건 기준으로는 격리율이 12.5%여서 경고가 나오지 않았다.
//     ★ 과다 필터링 감지의 목적은 "지금 돌린 작업이 잘못됐는가" 를 아는 것이다.
//       그 단위는 배치다. 누적 코퍼스가 아니다.
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('══════════════════════════════════════════');
console.log('■ ★ 배치별 과다 필터링 감지');
console.log('══════════════════════════════════════════');
let alertedBatches = 0;
for (const [name, its] of batches) {
  const r = detectOverFiltering(its);
  const head =
    `${name} — ${its.length}건 / 통과 ${r.accepted} / 격리 ${r.quarantined}` +
    (r.notRun > 0 ? ` (그 중 검증 미실행 ${r.notRun})` : '');
  if (r.alerts.length === 0 && r.notRun === 0) {
    console.log(`  ✔ ${head}`);
    continue;
  }
  alertedBatches += r.alerts.length > 0 ? 1 : 0;
  console.log(`  ${r.alerts.length > 0 ? '★★' : '  '} ${head}`);
  for (const line of formatAlerts(r)) console.log(`      ${line}`);
}
console.log('');
if (alertedBatches > 0) {
  console.log(`★★ 경고가 난 배치 ${alertedBatches}개. ★ 작업을 멈추고 원인을 판단해야 한다.`);
} else {
  console.log('★ 배치별 경고 없음.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 목록
// ─────────────────────────────────────────────────────────────────────────────
let target = all.filter((i) => i.verdict === 'quarantine');
if (RULE_ONLY) target = all.filter((i) => i.needsRuleDecision);
if (STAGE) target = target.filter((i) => (i.quarantine?.stage ?? i.rejectedAt) === STAGE);
if (REASON) target = target.filter((i) => (i.rejectReasons ?? []).includes(REASON));

function render(i) {
  const out = [];
  const g = i.generated ?? {};
  out.push(`─────────────────────────────────────────`);
  out.push(`ref: ${i.sourceRef}   배치: ${i._batch}`);
  out.push(`카테고리: ${categoryPath(i.gen?.midKey ?? '', i.gen?.sub)}`);
  out.push(`생성자: ${i.meta?.processModel ?? '?'}`);
  out.push('');
  out.push(`Q. ${g.questionKo ?? '(생성되지 않았다)'}`);
  out.push(`A. ${g.displayAnswer ?? ''}`);
  if (g.answers?.length) out.push(`   변형(${g.answers.length}): ${g.answers.join(' / ')}`);
  if (i.gen) {
    out.push(`   접근성 ${i.gen.accessibility} / 난이도 ${i.gen.difficultyScore} / 알가치 ${i.gen.worthKnowing}`);
  }
  if (g.explanation) out.push(`   해설: ${g.explanation}`);
  out.push('');
  out.push(`★ 격리 단계: ${i.quarantine?.stage ?? i.rejectedAt}`);
  out.push(`★ 사유 코드: ${(i.rejectReasons ?? []).join(', ')}`);
  out.push(`★ 판정자:   ${i.quarantine?.judgedBy ?? '?'}  (${i.quarantine?.judgedAt ?? '?'})`);
  if (i.quarantine?.confidence !== undefined) {
    out.push(`★ 확신도:   ${i.quarantine.confidence}`);
  }
  out.push(`★ 상세 사유: ${i.quarantine?.detail ?? '(없다)'}`);

  const bc = i.backcheck;
  if (bc) {
    out.push('');
    out.push(`역검증: ${bc.result} — 모델 답 "${bc.answer}" (확신 ${bc.confidence})`);
    if (bc.alternatives?.length) out.push(`   집합 밖 대안: ${bc.alternatives.join(', ')}`);
    if (bc.factualIssues?.length) out.push(`   ★ 사실 오류 지적: ${bc.factualIssues.join(' / ')}`);
    if (bc.uniquenessIssue?.length) out.push(`   ★ 유일성 지적: ${bc.uniquenessIssue.join(' / ')}`);
    if (bc.spellingIssues?.length) out.push(`   ★ 표기 지적: ${bc.spellingIssues.join(' / ')}`);
  }
  if (i.rules && !i.rules.pass) {
    out.push(`규칙 검사 실패: ${i.rules.reasons.join(', ')}`);
  }
  if (i.needsRuleDecision) {
    out.push('');
    out.push('★★ 규칙 충돌 — Opus 가 규칙을 판단해야 한다. 자동으로 살리거나 버리지 않는다');
  }
  if (i.finalDecision) {
    out.push('');
    out.push(`★ 최종 확정: ${i.finalDecision.verdict} — ${i.finalDecision.reason}`);
    out.push(`   판정자: ${i.finalDecision.decidedBy} (${i.finalDecision.decidedAt})`);
  } else {
    out.push('★ 최종 확정: 아직 없다 (Sonnet 대기)');
  }
  return out;
}

if (LIST || RULE_ONLY || STAGE || REASON) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(`■ 격리 목록 ${target.length}건`);
  if (RULE_ONLY) console.log('  (★ --rule-decision: 규칙 충돌만)');
  if (STAGE) console.log(`  (단계 = ${STAGE})`);
  if (REASON) console.log(`  (사유 = ${REASON})`);
  console.log('══════════════════════════════════════════');
  for (const i of target) for (const l of render(i)) console.log(l);
  if (target.length === 0) console.log('  해당하는 것이 없다.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ★ Sonnet 세션용 내보내기
// ─────────────────────────────────────────────────────────────────────────────
if (EXPORT) {
  const outDir = path.join(ROOT, 'data/pipeline/quarantine');
  await mkdir(outDir, { recursive: true });

  // ★ 사람이 읽을 텍스트
  const lines = [];
  lines.push('===========================================');
  lines.push('격리된 문제 — Sonnet 세션 검토 대상');
  lines.push('===========================================');
  lines.push('');
  lines.push('★ 이것들은 **버린 것이 아니다.** Gemini 가 문제를 표시했고 최종 확정을 기다린다.');
  lines.push('★ 판정 방법과 결과 형식은 docs/12-SONNET-SESSION.md 에 있다.');
  lines.push('');
  lines.push(`대상 ${target.length}건 / 전체 ${report.total}건 중 격리 ${report.quarantined}건`);
  lines.push(`단계별: ${JSON.stringify(report.byStage)}`);
  lines.push(`사유별: ${JSON.stringify(report.byReason)}`);
  lines.push('');
  for (const line of formatAlerts(report)) lines.push(line);
  lines.push('');
  for (const i of target) {
    for (const l of render(i)) lines.push(l);
    lines.push('');
  }
  const txtFile = path.join(outDir, 'quarantine-review.txt');
  await writeFile(txtFile, lines.join('\n') + '\n', 'utf8');

  // ★ Sonnet 이 결과를 채워 넣을 JSON 틀
  //   ★ 입력 파일과 출력 파일을 분리한다 — 두 세션이 같은 파일을 동시에 쓰지 않게 한다
  const template = {
    _meta: {
      purpose: '★ Sonnet 세션이 격리된 문제를 최종 확정한 결과',
      instructions: 'docs/12-SONNET-SESSION.md 를 읽고 채운다',
      inputFile: path.relative(ROOT, txtFile),
      generatedAt: new Date().toISOString(),
      count: target.length,
      rule: [
        '★ verdict 는 pass / drop / needsRuleDecision 중 하나다',
        '★ reason 을 반드시 채운다. 근거 없는 판정은 R010의 오탈락 사태를 반복한다',
        '★ addAnswers 는 살리면서 표기 변형을 추가할 때만 쓴다',
        '★ 확신이 없으면 needsRuleDecision 으로 둔다. 억지로 고르지 않는다',
      ],
    },
    decisions: target.map((i) => ({
      ref: i.sourceRef,
      question: i.generated?.questionKo ?? '',
      answer: i.generated?.displayAnswer ?? '',
      quarantineStage: i.quarantine?.stage ?? i.rejectedAt,
      quarantineReasons: i.rejectReasons ?? [],
      quarantineDetail: i.quarantine?.detail ?? '',
      needsRuleDecision: Boolean(i.needsRuleDecision),
      // ★ Sonnet 이 채울 칸. null 이면 아직 판정하지 않았다
      verdict: null,
      reason: null,
      addAnswers: [],
      decidedBy: 'claude-sonnet',
    })),
  };
  const jsonFile = path.join(outDir, 'quarantine-decisions.json');
  // ★ 이미 있으면 덮어쓰지 않는다. Sonnet 이 채운 것을 잃으면 안 된다
  let exists = false;
  try {
    await readFile(jsonFile, 'utf8');
    exists = true;
  } catch {
    /* 없다 */
  }
  if (exists) {
    console.log(`\n[qr] ★ ${path.relative(ROOT, jsonFile)} 가 이미 있다. 덮어쓰지 않았다.`);
    console.log('[qr]   ★ Sonnet 이 채운 판정을 잃지 않기 위한 것이다. 지우고 다시 실행한다.');
  } else {
    await writeFile(jsonFile, JSON.stringify(template, null, 2) + '\n', 'utf8');
    console.log(`\n[qr] 판정 틀: ${path.relative(ROOT, jsonFile)}`);
  }
  console.log(`[qr] 검토 자료: ${path.relative(ROOT, txtFile)}`);
  console.log('[qr] ★ Sonnet 세션에 docs/12-SONNET-SESSION.md 를 주고 위 두 파일을 가리키면 된다.');
}
