#!/usr/bin/env node
// =============================================================================
// R017 파일럿 측정 집계 (작업 B-2 / B-3 / 작업 C) — API 도 DB 도 쓰지 않는다
// =============================================================================

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeAnswer } from '../shared/dist/index.js';
import { generatedDir } from '../pipeline/lib/seedstore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUND = process.argv[2] ?? 'r017';
const dir = generatedDir(ROUND);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();

const docs = [];
for (const f of files) docs.push(JSON.parse(await readFile(path.join(dir, f), 'utf8')));

const all = [];
for (const d of docs) for (const it of d.items) all.push({ meta: d._meta, ...it });
const ok = all.filter((x) => x.question.ok);

const line = (s) => console.log(s);
const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;

line(`=== R017 파일럿 집계 ===\n`);

// ── 1. 소재 생성
line('■ 소재 생성 (프롬프트 A)');
let req = 0;
let act = 0;
let listed = 0;
let dropped = 0;
let kept = 0;
const shortfalls = [];
for (const d of docs) {
  const r = d._meta.seedResult ?? {};
  req += r.requestedCount ?? 0;
  act += r.actualCount ?? 0;
  listed += r.listedCandidates ?? 0;
  dropped += (r.droppedForOverlap ?? []).length;
  kept += (r.consideredButKept ?? []).length;
  if (r.actualCount !== r.requestedCount) shortfalls.push(`${d._meta.subId} ${r.actualCount}/${r.requestedCount} — ${r.shortfallReason}`);
}
line(`  요청 ${req} / 실제 ${act} (${pct(act, req)})`);
line(`  미달 소분류: ${shortfalls.length === 0 ? '없음' : shortfalls.join(' / ')}`);
line(`  나열한 후보 대상 합계 ${listed}개 → 선택 ${act}개 (선택률 ${pct(act, listed)})`);
line(`  knowledgePoint 겹침 등으로 제외한 소재 ${dropped}건`);
line(`  "관련은 있으나 중복 아님" 으로 일부러 살린 소재 ${kept}건`);

// 제외 사유를 갈래로
const dropByKind = { usedAnswers겹침: 0, 경계위반: 0, 사실확신부족: 0, 기타: 0 };
for (const d of docs) {
  for (const x of d._meta.seedResult?.droppedForOverlap ?? []) {
    if (/usedAnswers|usedSeeds/.test(x.reason)) dropByKind.usedAnswers겹침 += 1;
    else if (/경계/.test(x.reason)) dropByKind.경계위반 += 1;
    else if (/확신|속설|사실/.test(x.reason)) dropByKind.사실확신부족 += 1;
    else dropByKind.기타 += 1;
  }
}
line(`  제외 사유: ${JSON.stringify(dropByKind)}`);

// ── 2. 문제 생성
line(`\n■ 문제 생성 (프롬프트 B)`);
line(`  소재 ${all.length} → ok ${ok.length} (${pct(ok.length, all.length)}) / reject ${all.length - ok.length}`);

const sc = (k) => {
  const c = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const x of ok) {
    c[x.question[k] - 1] += 1;
    sum += x.question[k];
  }
  return { c, avg: (sum / ok.length).toFixed(2) };
};
for (const k of ['accessibility', 'difficulty', 'worthKnowing']) {
  const { c, avg } = sc(k);
  line(`  ${k.padEnd(14)} 1:${c[0]} 2:${c[1]} 3:${c[2]} 4:${c[3]} 5:${c[4]}  평균 ${avg}`);
}
const lowWorth = ok.filter((x) => x.question.worthKnowing <= 2).length;
const hardCount = ok.filter((x) => x.question.difficulty >= 4).length;
line(`  알 가치 1~2: ${lowWorth}건 (${pct(lowWorth, ok.length)})`);
line(`  난이도 4 이상: ${hardCount}건 (${pct(hardCount, ok.length)})`);

// ── 3. acceptedAnswers
const accDist = {};
for (const x of ok) {
  const k = x.question.acceptedAnswers.length;
  accDist[k] = (accDist[k] ?? 0) + 1;
}
const empty = accDist[0] ?? 0;
line(`\n■ acceptedAnswers 분포`);
for (const k of Object.keys(accDist).sort()) line(`  ${k}개: ${accDist[k]}건`);
line(`  ★ 빈 배열 ${empty}건 (${pct(empty, ok.length)})`);

// ── 4. 소재가 그대로 정답이 된 비율
//   ★ "소재 = 정답" 을 어떻게 잴 것인가
//     subject 를 정규화한 것이 정답을 정규화한 것과 같거나,
//     한쪽이 다른 쪽을 통째로 품고 있으면 "그대로" 로 센다.
let asAnswer = 0;
const asAnswerList = [];
for (const x of ok) {
  const s = normalizeAnswer(x.seed.subject);
  const a = normalizeAnswer(x.question.answer);
  if (s.length === 0 || a.length === 0) continue;
  if (s === a || s.includes(a) || a.includes(s)) {
    asAnswer += 1;
    asAnswerList.push(`${x.seedId}  subject="${x.seed.subject}" → answer="${x.question.answer}"`);
  }
}
line(`\n■ 소재(subject)가 그대로 정답이 된 비율`);
line(`  ${asAnswer}건 / ${ok.length}건 (${pct(asAnswer, ok.length)})`);

// ── 5. 정답 형태
const lens = ok.map((x) => [...x.question.answer].length).sort((p, q) => p - q);
const numeric = ok.filter((x) => /^\d+(\.\d+)?$/.test(x.question.answer.trim())).length;
line(`\n■ 정답 형태`);
line(`  글자 수  최소 ${lens[0]} / 중앙값 ${lens[Math.floor(lens.length / 2)]} / 최대 ${lens[lens.length - 1]} / 평균 ${(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1)}`);
line(`  숫자만인 정답 ${numeric}건 (${pct(numeric, ok.length)})`);

// ── 6. 질문 길이
const qlens = ok.map((x) => [...x.question.question].length).sort((p, q) => p - q);
line(`  질문 글자 수  최소 ${qlens[0]} / 중앙값 ${qlens[Math.floor(qlens.length / 2)]} / 최대 ${qlens[qlens.length - 1]}`);

// ── 7. selfCheck
let scFalse = 0;
for (const x of ok) {
  const s = x.question.selfCheck ?? {};
  if (s.answerInQuestion === true || s.uniqueAnswer === false || s.questionSelfConsistent === false) scFalse += 1;
}
line(`\n■ selfCheck 가 문제를 지적한 건수: ${scFalse}`);

// ── 8. 대분류별
line(`\n■ 대분류별 소분류·문제 수`);
const byMajor = {};
for (const d of docs) {
  const k = d._meta.majorKey;
  byMajor[k] ??= { subs: 0, items: 0 };
  byMajor[k].subs += 1;
  byMajor[k].items += d.items.filter((i) => i.question.ok).length;
}
for (const [k, v] of Object.entries(byMajor)) line(`  ${k.padEnd(12)} 소분류 ${v.subs} / 문제 ${v.items}`);

// ── 9. 소분류별 정답 중복 여부(같은 소분류 안)
line(`\n■ 소분류 안에서 정답이 겹친 건수`);
let dupInSub = 0;
for (const d of docs) {
  const seen = new Map();
  for (const it of d.items) {
    if (!it.question.ok) continue;
    const n = normalizeAnswer(it.question.answer);
    if (seen.has(n)) {
      dupInSub += 1;
      line(`  ★ ${d._meta.subId}: "${it.question.answer}" 가 ${seen.get(n)} 와 겹친다`);
    }
    seen.set(n, it.seedId);
  }
}
line(`  합계 ${dupInSub}건`);
