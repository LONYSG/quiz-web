#!/usr/bin/env node
// =============================================================================
// 샘플 출제 시트 만들기 (작업 D-2 / R011)
//
// ★ 건우가 읽고 판단하는 문서를 만든다. 형식은 지시대로 고정이다.
//     [대분류 > 중분류 > 소분류]
//     Q. 질문
//     A. 대표 정답
//        변형: …
//        접근성 N / 난이도 N
//        해설: …
//
// ★ 카테고리 순서대로 묶는다. 섞지 않는다. 건우가 카테고리 단위로 판단해야 한다.
//
// 사용법
//   node scripts/pipeline-samples.mjs                 전체
//   node scripts/pipeline-samples.mjs --rejected       탈락한 것까지
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';
import { MAJORS, MIDS, categoryPath } from '../pipeline/dist/categories.js';
import { findDuplicates } from '../pipeline/dist/dedupe.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const WITH_REJECTED = args.includes('--rejected');

const processedDir = path.join(ROOT, DATA_DIRS.processed);
const files = (await readdir(processedDir)).filter((f) => f.includes('-gen') && f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('[samples] 생성 배치가 없다. 먼저 npm run pipeline:generate 를 실행한다.');
  process.exit(1);
}

const items = [];
const metas = [];
for (const f of files) {
  const data = JSON.parse(await readFile(path.join(processedDir, f), 'utf8'));
  metas.push({ file: f, meta: data._meta });
  for (const i of data.items ?? []) items.push({ ...i, _batch: f });
}

const accepted = items.filter((i) => i.verdict === 'accept' && i.generated);
const rejected = items.filter((i) => i.verdict !== 'accept');

// ── 중분류 → 항목
const byMid = new Map();
for (const i of accepted) {
  const k = i.gen?.midKey ?? '?';
  const arr = byMid.get(k) ?? [];
  arr.push(i);
  byMid.set(k, arr);
}

const lines = [];
const out = (s = '') => lines.push(s);

out('===========================================');
out('R011 카테고리별 샘플 문제 (건우 판단용)');
out('===========================================');
out('');
out(`생성 배치: ${files.join(', ')}`);
out(`통과 ${accepted.length}건 / 탈락 ${rejected.length}건 / 중분류 ${byMid.size}개`);
out('');
out('★ 형식');
out('  [대분류 > 중분류 > 소분류]');
out('  Q. 질문');
out('  A. 대표 정답');
out('     변형: 판정에 쓰이는 표기 전부');
out('     접근성 N / 난이도 N   (접근성=분야를 아는가, 난이도=문항이 어려운가)');
out('     해설: …');
out('');
out('★ 접근성과 난이도는 모델이 매긴 점수다. 설계 담당의 자기 평가는 R011.txt 4-2 에 있다.');
out('');

let midCount = 0;
for (const major of MAJORS) {
  const mids = MIDS.filter((m) => m.major === major.key && byMid.has(m.key));
  if (mids.length === 0) continue;
  out('');
  out('═══════════════════════════════════════════');
  out(`■ 대분류: ${major.nameKo}`);
  out('═══════════════════════════════════════════');
  for (const mid of mids) {
    midCount += 1;
    const arr = byMid.get(mid.key);
    out('');
    out(`── 중분류: ${mid.nameKo}  (${arr.length}건)`);
    if (mid.boundary) out(`   경계: ${mid.boundary}`);
    out('');
    for (const i of arr) {
      const g = i.generated;
      out(`[${categoryPath(mid.key, i.gen?.sub)}]`);
      out(`Q. ${g.questionKo}`);
      out(`A. ${g.displayAnswer}`);
      out(`   변형: ${g.answers.join(' / ')}`);
      out(`   접근성 ${i.gen?.accessibility} / 난이도 ${i.gen?.difficultyScore}`);
      if (g.explanation) out(`   해설: ${g.explanation}`);
      if (i.review?.note) out(`   ★ 검수 메모: ${i.review.note}`);
      if (i.backcheck) {
        out(`   역검증: ${i.backcheck.result} (모델 답 "${i.backcheck.answer}", 확신 ${i.backcheck.confidence})`);
      }
      out(`   ref: ${i.sourceRef}`);
      out('');
    }
  }
}

// ── 탈락 목록 (근거 보관)
out('');
out('═══════════════════════════════════════════');
out(`■ 탈락 ${rejected.length}건 — ★ 버리지 않고 남긴다 (판정 품질 평가 근거)`);
out('═══════════════════════════════════════════');
out('');
for (const i of rejected) {
  out(`[${categoryPath(i.gen?.midKey ?? '?', i.gen?.sub)}]  단계: ${i.rejectedAt} / 사유: ${i.rejectReasons.join(', ')}`);
  if (i.generated?.questionKo) {
    out(`   Q. ${i.generated.questionKo}`);
    out(`   A. ${i.generated.displayAnswer}  (변형 ${i.generated.answers.length}개)`);
  }
  if (i.gen?.offCategoryReason) out(`   ★ 모델 사유: ${i.gen.offCategoryReason}`);
  if (i.backcheck) out(`   역검증: ${i.backcheck.result} — ${i.backcheck.note ?? ''}`);
  out('');
}

// ── 중복 판정
const dupe = findDuplicates(
  accepted.map((r) => ({
    ref: r.sourceRef,
    midKey: r.gen?.midKey ?? '',
    majorKey: r.gen?.majorKey ?? '',
    question: r.generated.questionKo,
    answers: r.generated.answers,
  })),
);
const byRef = new Map(accepted.map((a) => [a.sourceRef, a]));

out('');
out('═══════════════════════════════════════════');
out('■ 중복 판정 결과 (D-4)');
out('═══════════════════════════════════════════');
out('');
out(`후보 쌍 ${dupe.candidatePairs}쌍 (정답이 겹쳐 후보가 된 것) / 전수 비교라면 ${dupe.totalPairsIfBruteForce}쌍`);
out(`판정: 중복 ${dupe.counts.duplicate} / 의심 ${dupe.counts.suspect} / 문제없음 ${dupe.counts.ok}`);
out('');
for (const p of dupe.pairs) {
  const a = byRef.get(p.a);
  const b = byRef.get(p.b);
  out(`[${p.verdict}] ${p.level} 유사도 ${p.similarity.toFixed(2)} — ${p.reason}`);
  out(`   A. ${categoryPath(a?.gen?.midKey ?? '')} | ${a?.generated.questionKo} → ${a?.generated.displayAnswer}`);
  out(`   B. ${categoryPath(b?.gen?.midKey ?? '')} | ${b?.generated.questionKo} → ${b?.generated.displayAnswer}`);
  out('');
}

// ── 통계
const acc = accepted.map((i) => i.gen?.accessibility ?? 0);
const dif = accepted.map((i) => i.gen?.difficultyScore ?? 0);
const ansCounts = accepted.map((i) => i.generated.answers.length);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const dist = (a) => {
  const d = {};
  for (const v of a) d[v] = (d[v] ?? 0) + 1;
  return Object.entries(d).sort().map(([k, v]) => `${k}점 ${v}건`).join(' / ');
};

out('');
out('═══════════════════════════════════════════');
out('■ 통계');
out('═══════════════════════════════════════════');
out('');
out(`접근성 평균 ${avg(acc).toFixed(2)}  분포: ${dist(acc)}`);
out(`난이도 평균 ${avg(dif).toFixed(2)}  분포: ${dist(dif)}`);
out(`복수 정답 평균 ${avg(ansCounts).toFixed(2)}개 (최소 ${Math.min(...ansCounts)} / 최대 ${Math.max(...ansCounts)})`);
out('');
for (const m of metas) {
  const c = m.meta.counts;
  out(`${m.file}`);
  out(`  슬롯 ${c.requestedSlots} → LLM ${c.llmSlots} → 통과 ${c.accepted}` +
    ` (누락 ${c.missing} / 카테고리불일치 ${c.offCategory} / 역검증탈락 ${c.backcheckRejected} / 규칙탈락 ${c.rulesRejected})`);
  out(`  토큰 ${m.meta.tokens.total} (사고 ${m.meta.tokens.thoughts}) / 호출 ${m.meta.tokens.calls}회 / 승급 ${c.escalated}건`);
  out(`  모델: ${JSON.stringify(m.meta.modelUsage)}`);
}

const sampleDir = path.join(ROOT, 'data/pipeline/samples');
await mkdir(sampleDir, { recursive: true });
const file = path.join(sampleDir, `R011-samples.txt`);
await writeFile(file, lines.join('\n') + '\n', 'utf8');
console.log(`[samples] 중분류 ${midCount}개 / 통과 ${accepted.length}건 / 탈락 ${rejected.length}건`);
console.log(`[samples] 접근성 평균 ${avg(acc).toFixed(2)} / 난이도 평균 ${avg(dif).toFixed(2)} / 복수정답 평균 ${avg(ansCounts).toFixed(2)}개`);
console.log(`[samples] 중복 판정: 중복 ${dupe.counts.duplicate} / 의심 ${dupe.counts.suspect} / 문제없음 ${dupe.counts.ok}`);
console.log(`[samples] 저장: ${path.relative(ROOT, file)}`);
if (WITH_REJECTED) {
  console.log('\n[samples] 탈락 상세:');
  for (const i of rejected) {
    console.log(`  ${categoryPath(i.gen?.midKey ?? '?')} / ${i.rejectedAt} / ${i.rejectReasons.join(',')}` +
      (i.generated?.questionKo ? ` | ${i.generated.questionKo} → ${i.generated.displayAnswer}` : ''));
  }
}
