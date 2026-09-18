#!/usr/bin/env node
// =============================================================================
// 이미 들어 있는 소재에 **문제를 붙인다** (2단계)
//
// ★★ R018 에서 소재 생성과 문제 생성을 나눴다.
//   1단계 seeds-ingest.mjs   소재만 넣는다 (question.status = 'pending')
//   2단계 (이 스크립트)       그 소재에 문제를 붙인다
//
//   ★ 근거: R017 은 같은 세션이 소재와 문제를 연달아 만들어서
//     프롬프트 B 의 거절 경로가 한 번도 시험되지 않았다 (거절 0건).
//     ★ 나누면 문제 세션은 **자기가 만들지 않은 소재**를 받게 되므로
//       "이 소재로는 이 카테고리의 문제를 만들 수 없다" 가 실제로 나올 수 있다.
//
// ★★ seedId 로 짝을 맞춘다. 순서에 기대지 않는다 —
//   문제 세션이 일부만 돌려주거나 순서를 바꿔 돌려줄 수 있기 때문이다.
//
// ★ 이미 붙은 문제를 덮어쓰지 않는다. 덮어쓰려면 사람이 먼저 지워야 한다.
//   ★ 근거: 두 세션이 같은 소분류를 동시에 처리하면 조용히 한쪽이 사라진다.
//
// ★★ DB 에 쓰지 않는다.
//
// 입력 파일 형식 (문제 세션의 출력)
//   {
//     "round": "r018", "subId": "myth/2",
//     "questionPrompt": "question-v2", "generator": "claude-opus-5",
//     "items": [ { "seedId": "myth/2#001", "question": { ...프롬프트 B 출력... } } ]
//   }
//
// 사용법
//   node scripts/seeds-attach.mjs tmp/r018/questions/myth-2.json
//   node scripts/seeds-attach.mjs --dry-run tmp/r018/questions/*.json
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveSubId, slugOf } from '../pipeline/lib/subid.mjs';
import { attachQuestions, generatedDir, loadState, saveState } from '../pipeline/lib/seedstore.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('문제 파일 경로가 필요하다');
  process.exit(1);
}

const state = await loadState();
state.subs ??= {};
state.log ??= [];

let totalOk = 0;
let totalRejected = 0;

// ★★ R019: 한 파일에 **여러 소분류**를 배열로 담을 수 있게 했다.
//   ★ 근거: 60개 소분류를 한 라운드에 돌리면 파일이 60개가 된다.
//     쉘 히어독으로 여러 파일을 한 번에 쓰다 깨지는 일이 반복돼, 파일 하나에 묶는 길을 열었다.
//   ★ 배열이 아니면 지금까지처럼 배치 하나로 다룬다. 옛 파일이 그대로 동작한다.
const batches = [];
for (const file of files) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  for (const b of Array.isArray(parsed) ? parsed : [parsed]) batches.push({ file, batch: b });
}

for (const { file, batch } of batches) {
  for (const k of ['round', 'subId', 'questionPrompt', 'generator', 'items']) {
    if (!batch[k]) throw new Error(`${file}: 필수 필드 없음 — ${k}`);
  }
  const r = resolveSubId(batch.subId);

  // ── 형식 검사. 조용히 통과시키지 않는다
  for (const [i, e] of batch.items.entries()) {
    if (!e.seedId) throw new Error(`${file}: items[${i}] seedId 가 없다`);
    if (!e.seedId.startsWith(`${batch.subId}#`)) {
      throw new Error(`${file}: items[${i}] seedId "${e.seedId}" 가 subId "${batch.subId}" 와 다르다`);
    }
    const q = e.question;
    if (!q || typeof q.ok !== 'boolean') throw new Error(`${file}: items[${i}] question.ok 가 없다`);
    if (q.ok) {
      for (const k of ['question', 'answer', 'explanation']) {
        if (!q[k]) throw new Error(`${file}: items[${i}] question.${k} 가 비었다`);
      }
      if (!Array.isArray(q.acceptedAnswers)) {
        throw new Error(`${file}: items[${i}] acceptedAnswers 가 배열이 아니다`);
      }
      for (const k of ['accessibility', 'difficulty', 'worthKnowing']) {
        if (!Number.isInteger(q[k]) || q[k] < 1 || q[k] > 5) {
          throw new Error(`${file}: items[${i}] ${k} 가 1~5 정수가 아니다 (${q[k]})`);
        }
      }
      if (!q.selfCheck) throw new Error(`${file}: items[${i}] selfCheck 가 없다`);
    } else if (!q.rejectReason) {
      throw new Error(`${file}: items[${i}] ok:false 인데 rejectReason 이 없다`);
    }
  }

  // ── 생성 결과 파일 쪽
  const genFile = path.join(generatedDir(batch.round), `${slugOf(batch.subId)}.json`);
  const doc = JSON.parse(await readFile(genFile, 'utf8'));
  for (const e of batch.items) {
    const item = doc.items.find((x) => x.seedId === e.seedId);
    if (!item) throw new Error(`${file}: ${e.seedId} 가 ${genFile} 에 없다`);
    if (item.question?.status !== 'pending') {
      throw new Error(`${file}: ${e.seedId} 는 이미 문제가 붙어 있다. 덮어쓰지 않는다`);
    }
  }

  const ok = batch.items.filter((e) => e.question.ok).length;
  const rejected = batch.items.length - ok;
  const stillPending = doc.items.filter((x) => x.question?.status === 'pending').length - batch.items.length;

  console.log(
    `${DRY ? '[dry]' : '[ok] '} ${batch.subId.padEnd(18)} 붙임 ${String(batch.items.length).padStart(2)} / 성공 ${ok} / 거절 ${rejected}` +
      (stillPending > 0 ? `  ★ 아직 대기 ${stillPending}` : ''),
  );
  for (const e of batch.items) {
    if (!e.question.ok) console.log(`      ★ 거절 ${e.seedId}: ${e.question.rejectReason}`);
  }

  totalOk += ok;
  totalRejected += rejected;
  if (DRY) continue;

  for (const e of batch.items) {
    const item = doc.items.find((x) => x.seedId === e.seedId);
    item.question = e.question;
  }
  doc._meta.questionPrompt = batch.questionPrompt;
  doc._meta.questionGenerator = batch.generator;
  doc._meta.questionsAt = batch.generatedAt ?? new Date().toISOString();
  doc._meta.stage = doc.items.some((x) => x.question?.status === 'pending') ? 'seeds+partial' : 'seeds+questions';
  await writeFile(genFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  const res = await attachQuestions(batch.subId, batch.items, {
    round: batch.round,
    questionPrompt: batch.questionPrompt,
    generator: batch.generator,
  });

  const key = `${batch.round}:${batch.subId}`;
  const row = state.subs[key] ?? { subId: batch.subId, categoryPath: r.path };
  row.questionsPending = (row.questionsPending ?? 0) - res.attached;
  row.questionsOk = (row.questionsOk ?? 0) + res.ok;
  row.questionsRejected = (row.questionsRejected ?? 0) + res.rejected;
  row.questionsAt = new Date().toISOString();
  state.subs[key] = row;
  state.log.push(
    `${new Date().toISOString()} attach ${key} ok=${res.ok} rejected=${res.rejected}`,
  );
}

if (!DRY) await saveState(state);
console.log(`\n[합계] 성공 ${totalOk} / 거절 ${totalRejected}${DRY ? '  (dry-run — 바꾸지 않았다)' : ''}`);
