#!/usr/bin/env node
// =============================================================================
// Gemini vs Claude Code 비교 보고 (R012 작업 A-4 / A-5)
//
// ★ 건우가 눈으로 비교할 자료를 만든다. 점수만 적지 않는다 —
//   소분류마다 양쪽 문제를 나란히 놓고 상대 모델의 검증 결과를 함께 적는다.
//
// 사용법
//   node scripts/pipeline-compare-report.mjs
// =============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';
import { categoryPath, findMajor, findMid, MAJORS } from '../pipeline/dist/categories.js';
import { findDuplicates } from '../pipeline/dist/dedupe.js';
import { selectQuestions, SELECT, explainReason } from '../pipeline/dist/select.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, DATA_DIRS.processed);

const G = JSON.parse(await readFile(path.join(dir, '2026-09-10-compare-gemini.json'), 'utf8'));
const C = JSON.parse(await readFile(path.join(dir, '2026-09-10-compare-claude.json'), 'utf8'));

const spec = JSON.parse(await readFile(path.join(ROOT, 'data/pipeline/compare-slots.json'), 'utf8'));

const lines = [];
const out = (s = '') => lines.push(s);

// ─────────────────────────────────────────────────────────────────────────────
// 집계 함수
// ─────────────────────────────────────────────────────────────────────────────
function summarize(batch, label) {
  const items = batch.items;
  const acc = items.filter((i) => i.verdict === 'accept');
  const dist = (get) => {
    const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const i of acc) {
      const v = get(i);
      if (d[v] !== undefined) d[v] += 1;
    }
    return d;
  };
  const avg = (get) => (acc.length ? acc.reduce((s, i) => s + get(i), 0) / acc.length : 0);
  const reasons = {};
  for (const i of items) {
    if (i.verdict !== 'accept') for (const r of i.rejectReasons) reasons[r] = (reasons[r] ?? 0) + 1;
  }
  const ansLens = acc.map((i) => i.generated.answers.length);
  const qLens = acc.map((i) => i.generated.questionKo.length);

  const dupe = findDuplicates(
    acc.map((i) => ({
      ref: i.sourceRef,
      midKey: i.gen?.midKey ?? '',
      majorKey: i.gen?.majorKey ?? '',
      question: i.generated.questionKo,
      answers: i.generated.answers,
    })),
  );

  return {
    label,
    total: items.length,
    accepted: acc.length,
    missing: batch._meta.counts?.missing ?? 0,
    offCategory: items.filter((i) => i.gen?.offCategory).length,
    reasons,
    answerInQuestion: reasons.answer_in_question ?? 0,
    answerShape: reasons.answer_shape ?? 0,
    backcheck: (reasons.backcheck_mismatch ?? 0) + (reasons.backcheck_ambiguous ?? 0),
    accessDist: dist((i) => i.gen?.accessibility),
    diffDist: dist((i) => i.gen?.difficultyScore),
    worthDist: dist((i) => i.gen?.worthKnowing),
    accessAvg: avg((i) => i.gen?.accessibility ?? 0),
    diffAvg: avg((i) => i.gen?.difficultyScore ?? 0),
    worthAvg: avg((i) => i.gen?.worthKnowing ?? 0),
    ansAvg: ansLens.length ? ansLens.reduce((a, b) => a + b, 0) / ansLens.length : 0,
    ansMin: Math.min(...ansLens),
    ansMax: Math.max(...ansLens),
    qAvg: qLens.length ? qLens.reduce((a, b) => a + b, 0) / qLens.length : 0,
    qMax: Math.max(...qLens),
    dupe,
    needsReview: acc.filter((i) => i.review?.note).length,
    langs: acc.reduce((m, i) => {
      m[i.generated.answerLang] = (m[i.generated.answerLang] ?? 0) + 1;
      return m;
    }, {}),
    acc,
    items,
  };
}

const sg = summarize(G, 'Gemini');
const sc = summarize(C, 'Claude Code');

const row = (name, a, b) => out(`| ${name} | ${a} | ${b} |`);
const dstr = (d) => [1, 2, 3, 4, 5].map((k) => `${k}:${d[k]}`).join(' ');

out('===========================================');
out('R012 Gemini vs Claude Code 생성 비교 (전문)');
out('===========================================');
out('');
out('★ 조건은 같다 —');
out(`   같은 소분류 ${spec.slots.length}개 × ${spec._meta.perSlot}건 = 각각 ${spec.slots.length * spec._meta.perSlot}건`);
out(`   같은 프롬프트 (${G._meta.promptVersion})`);
out('   ★ 카테고리는 입력이다. 양쪽이 같은 슬롯 목록을 받았다');
out('');
out('★ 교차 검증 —');
out(`   Gemini 생성분      → ${G._meta.verifier} 가 역검증`);
out(`   Claude Code 생성분 → ${C._meta.verifier} 가 역검증`);
out('   ★ 자기 생성분을 자기가 검증하지 않았다');
out('');

// ─────────────────────────────────────────────────────────────────────────────
out('═══════════════════════════════════════════');
out('■ 1. 비교표');
out('═══════════════════════════════════════════');
out('');
out('| 항목 | Gemini | Claude Code |');
out('|------|--------|-------------|');
row('생성 건수', sg.total, sc.total);
row('슬롯 누락', sg.missing, sc.missing);
row('카테고리 어긋남 (offCategory)', sg.offCategory, sc.offCategory);
row('★ 질문에 정답 노출', sg.answerInQuestion, sc.answerInQuestion);
row('표기 변형 형식 탈락', sg.answerShape, sc.answerShape);
row('역검증 탈락', sg.backcheck, sc.backcheck);
row('★ 최종 통과', `${sg.accepted} (${((sg.accepted / sg.total) * 100).toFixed(1)}%)`, `${sc.accepted} (${((sc.accepted / sc.total) * 100).toFixed(1)}%)`);
row('★ 같은 100건 안의 중복 후보 쌍', sg.dupe.candidatePairs, sc.dupe.candidatePairs);
row('  그중 같은 중분류', sg.dupe.pairs.filter((p) => p.level === 'same-mid' || p.level === 'exact').length, sc.dupe.pairs.filter((p) => p.level === 'same-mid' || p.level === 'exact').length);
row('★ 접근성 분포', dstr(sg.accessDist), dstr(sc.accessDist));
row('   접근성 평균', sg.accessAvg.toFixed(2), sc.accessAvg.toFixed(2));
row('★ 난이도 분포', dstr(sg.diffDist), dstr(sc.diffDist));
row('   난이도 평균', sg.diffAvg.toFixed(2), sc.diffAvg.toFixed(2));
row('★ 알 가치 분포', dstr(sg.worthDist), dstr(sc.worthDist));
row('   알 가치 평균', sg.worthAvg.toFixed(2), sc.worthAvg.toFixed(2));
row('복수 정답 평균 개수', `${sg.ansAvg.toFixed(2)} (${sg.ansMin}~${sg.ansMax})`, `${sc.ansAvg.toFixed(2)} (${sc.ansMin}~${sc.ansMax})`);
row('질문 평균 길이(자)', `${sg.qAvg.toFixed(1)} (최대 ${sg.qMax})`, `${sc.qAvg.toFixed(1)} (최대 ${sc.qMax})`);
row('검수 메모 붙은 건', sg.needsReview, sc.needsReview);
row('정답 언어', JSON.stringify(sg.langs), JSON.stringify(sc.langs));
out('');
out(`탈락 사유 (Gemini):      ${JSON.stringify(sg.reasons)}`);
out(`탈락 사유 (Claude Code): ${JSON.stringify(sc.reasons)}`);
out('');

// ─────────────────────────────────────────────────────────────────────────────
out('═══════════════════════════════════════════');
out('■ 2. 소분류별 나란히 보기 (★ 건우 판단용 핵심)');
out('═══════════════════════════════════════════');
out('');
out('★ 각 소분류의 양쪽 문제를 전부 나란히 적는다.');
out('   [G] = Gemini 생성 (Claude Code 가 역검증) / [C] = Claude Code 생성 (Gemini 가 역검증)');
out('');

const gByKey = new Map();
const cByKey = new Map();
for (const i of sg.items) {
  const k = `${i.gen?.midKey}@${i.gen?.sub}`;
  (gByKey.get(k) ?? gByKey.set(k, []).get(k)).push(i);
}
for (const i of sc.items) {
  const k = `${i.gen?.midKey}@${i.gen?.sub}`;
  (cByKey.get(k) ?? cByKey.set(k, []).get(k)).push(i);
}

function fmt(item, tag) {
  const g = item.generated;
  const bc = item.backcheck;
  const res = [];
  res.push(`  ${tag} Q. ${g.questionKo}`);
  res.push(`     A. ${g.displayAnswer}`);
  res.push(`        변형(${g.answers.length}): ${g.answers.join(' / ')}`);
  res.push(
    `        접근성 ${item.gen?.accessibility} / 난이도 ${item.gen?.difficultyScore} / 알가치 ${item.gen?.worthKnowing}`,
  );
  if (g.explanation) res.push(`        해설: ${g.explanation}`);
  if (bc) {
    res.push(
      `        ★ 상대 검증: ${bc.result} — 답 "${bc.answer}" (확신 ${bc.confidence})` +
        (bc.alternatives?.length ? ` / 대안 [${bc.alternatives.join(', ')}]` : ''),
    );
  }
  if (item.verdict !== 'accept') {
    res.push(`        ★★ 탈락: ${item.rejectedAt} / ${item.rejectReasons.join(', ')}`);
  }
  if (item.review?.note) res.push(`        ★ 메모: ${item.review.note}`);
  return res;
}

for (const s of spec.slots) {
  const key = `${s.midKey}@${s.sub}`;
  const mid = findMid(s.midKey);
  const major = findMajor(mid.major);
  out('');
  out('───────────────────────────────────────────');
  out(`▶ ${major?.nameKo} > ${mid.nameKo} > ${s.sub}`);
  out(`   선정 이유: ${s.why}`);
  out('───────────────────────────────────────────');
  out('');
  out('[Gemini 생성]');
  for (const i of gByKey.get(key) ?? []) {
    for (const l of fmt(i, ' ')) out(l);
    out('');
  }
  out('[Claude Code 생성]');
  for (const i of cByKey.get(key) ?? []) {
    for (const l of fmt(i, ' ')) out(l);
    out('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
out('');
out('═══════════════════════════════════════════');
out('■ 3. 양쪽을 합친 중복 검사 (소재 쏠림 관측)');
out('═══════════════════════════════════════════');
out('');

const merged = [
  ...sg.acc.map((i) => ({ ...i, _src: 'G' })),
  ...sc.acc.map((i) => ({ ...i, _src: 'C' })),
];
const mergedDupe = findDuplicates(
  merged.map((i) => ({
    ref: `${i._src}:${i.sourceRef}`,
    midKey: i.gen?.midKey ?? '',
    majorKey: i.gen?.majorKey ?? '',
    question: i.generated.questionKo,
    answers: i.generated.answers,
  })),
);
const mref = new Map(merged.map((i) => [`${i._src}:${i.sourceRef}`, i]));

const cross = mergedDupe.pairs.filter((p) => p.a[0] !== p.b[0]);
const within = mergedDupe.pairs.filter((p) => p.a[0] === p.b[0]);

out(`양쪽 합계 ${merged.length}건 / 전수 비교라면 ${mergedDupe.totalPairsIfBruteForce}쌍`);
out(`정답으로 좁힌 후보 ${mergedDupe.candidatePairs}쌍`);
out(`  ★ 양쪽 사이(G↔C) ${cross.length}쌍 — **두 모델이 같은 소재로 쏠렸는가**`);
out(`  한쪽 안에서 ${within.length}쌍`);
out('');
out('★ 양쪽 사이에 정답이 겹친 쌍 전부:');
out('');
for (const p of cross) {
  const a = mref.get(p.a);
  const b = mref.get(p.b);
  out(`[${p.level}] 정답 "${p.sharedAnswer}"  (${categoryPath(a.gen?.midKey, a.gen?.sub)})`);
  out(`   G. ${a._src === 'G' ? a.generated.questionKo : b.generated.questionKo}`);
  out(`   C. ${a._src === 'C' ? a.generated.questionKo : b.generated.questionKo}`);
  out('');
}
if (within.length > 0) {
  out('★ 한쪽 안에서 겹친 쌍:');
  out('');
  for (const p of within) {
    const a = mref.get(p.a);
    const b = mref.get(p.b);
    out(`[${p.a[0]}] [${p.level}] 정답 "${p.sharedAnswer}"`);
    out(`   1. ${a.generated.questionKo}  (${a.gen?.sub})`);
    out(`   2. ${b.generated.questionKo}  (${b.gen?.sub})`);
    out('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
out('');
out('═══════════════════════════════════════════');
out('■ 4. 선별 기준(Q-69) 적용 결과');
out('═══════════════════════════════════════════');
out('');
out(`기준: 접근성 ${SELECT.minAccessibility} 이상 통과 / ${SELECT.tolerateAccessibility} 등급은 전체의 ${(SELECT.tolerateRatio * 100).toFixed(0)}% 이내 / 알 가치 ${SELECT.minWorthKnowing} 이상`);
out(`      ★ 난이도로 걸러내지 않는다 (minDifficulty=${SELECT.minDifficulty}, 0 이면 미검사)`);
out('');
for (const s of [sg, sc]) {
  const rep = selectQuestions(
    s.acc.map((i) => ({
      ref: i.sourceRef,
      accessibility: i.gen?.accessibility ?? 0,
      difficultyScore: i.gen?.difficultyScore ?? 0,
      worthKnowing: i.gen?.worthKnowing ?? 0,
    })),
  );
  out(`${s.label}: 통과 ${rep.passed} / 제외 ${rep.rejected}  ${JSON.stringify(rep.reasonCounts)}`);
  const refMap = new Map(s.acc.map((i) => [i.sourceRef, i]));
  for (const r of rep.results.filter((x) => !x.pass)) {
    const i = refMap.get(r.ref);
    out(`   ★ 제외: ${i.generated.questionKo} → ${i.generated.displayAnswer}`);
    out(`      접${i.gen.accessibility}/난${i.gen.difficultyScore}/알${i.gen.worthKnowing}  사유: ${r.reasons.map(explainReason).join(' / ')}`);
  }
  out('');
}

const sampleDir = path.join(ROOT, 'data/pipeline/samples');
await mkdir(sampleDir, { recursive: true });
const file = path.join(sampleDir, 'R012-compare.txt');
await writeFile(file, lines.join('\n') + '\n', 'utf8');

console.log('──────────────────────────────────────────');
console.log(`[cr] Gemini      통과 ${sg.accepted}/${sg.total} / 접근성 ${sg.accessAvg.toFixed(2)} / 난이도 ${sg.diffAvg.toFixed(2)} / 알가치 ${sg.worthAvg.toFixed(2)} / 변형 ${sg.ansAvg.toFixed(2)}개`);
console.log(`[cr] Claude Code 통과 ${sc.accepted}/${sc.total} / 접근성 ${sc.accessAvg.toFixed(2)} / 난이도 ${sc.diffAvg.toFixed(2)} / 알가치 ${sc.worthAvg.toFixed(2)} / 변형 ${sc.ansAvg.toFixed(2)}개`);
console.log(`[cr] 접근성 분포 G ${dstr(sg.accessDist)} | C ${dstr(sc.accessDist)}`);
console.log(`[cr] 난이도 분포 G ${dstr(sg.diffDist)} | C ${dstr(sc.diffDist)}`);
console.log(`[cr] 알가치 분포 G ${dstr(sg.worthDist)} | C ${dstr(sc.worthDist)}`);
console.log(`[cr] 질문 길이 G ${sg.qAvg.toFixed(1)}자 | C ${sc.qAvg.toFixed(1)}자`);
console.log(`[cr] 중복 후보 G ${sg.dupe.candidatePairs}쌍 | C ${sc.dupe.candidatePairs}쌍 | ★ 양쪽 사이 ${cross.length}쌍`);
console.log(`[cr] 저장: ${path.relative(ROOT, file)}`);
