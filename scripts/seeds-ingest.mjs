#!/usr/bin/env node
// =============================================================================
// 소재 배치 파일을 소재 저장소와 생성 결과 디렉터리에 반영한다 (1단계)
//
// ★★ R018: 소재 생성과 문제 생성을 나눴다.
//   1단계 (이 스크립트)     소재만 넣는다. 문제는 pending 으로 둔다
//   2단계 seeds-attach.mjs  그 소재에 문제를 붙인다
//   ★ 근거와 형식은 docs/14-GEN-SESSION.md 에 있다
//
// ★ 옛 형식(items 에 seed 와 question 이 함께 있는 것)도 그대로 받는다 — R017 배치를 위해서다
//
// ★★ DB 에 쓰지 않는다. 파일만 만든다.
// ★ 같은 배치를 두 번 넣지 않도록 _state.json 의 ingested 를 확인한다 (중단·재개).
//
// 사용법
//   node scripts/seeds-ingest.mjs tmp/r017/batch/kr-language-1.json
//   node scripts/seeds-ingest.mjs tmp/r017/batch/*.json
//   node scripts/seeds-ingest.mjs --force tmp/r017/batch/kr-language-1.json
// =============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveSubId, slugOf } from '../pipeline/lib/subid.mjs';
import { generatedDir, ingestBatch, loadState, saveState } from '../pipeline/lib/seedstore.mjs';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('배치 파일 경로가 필요하다');
  process.exit(1);
}

const state = await loadState();
state.subs ??= {};
state.log ??= [];

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

  // ── 형식 검사. 조용히 통과시키지 않는다
  for (const k of ['round', 'subId', 'seedPrompt', 'generator']) {
    if (!batch[k]) throw new Error(`${file}: 필수 필드 없음 — ${k}`);
  }
  const r = resolveSubId(batch.subId);
  if (batch.subName && batch.subName !== r.subName) {
    throw new Error(`${file}: 소분류 이름 불일치 — "${batch.subName}" vs "${r.subName}"`);
  }
  batch.generatedAt ??= new Date().toISOString();

  // ★ 두 형식을 받는다
  //   (가) seeds: [...]              소재만 (R018 이후의 1단계)
  //   (나) items: [{seed, question}] 소재+문제 (R017 형식)
  const seedsOnly = Array.isArray(batch.seeds);
  if (!seedsOnly && !Array.isArray(batch.items)) {
    throw new Error(`${file}: seeds 도 items 도 없다`);
  }
  const rows = seedsOnly
    ? batch.seeds.map((seed) => ({ seed, question: null }))
    : batch.items;

  for (const [i, it] of rows.entries()) {
    if (!it.seed?.subject || !it.seed?.aspect || !it.seed?.knowledgePoint) {
      throw new Error(`${file}: [${i}] 소재 필드가 비었다`);
    }
    const q = it.question;
    if (q === null || q === undefined) continue;
    if (typeof q.ok !== 'boolean') throw new Error(`${file}: [${i}] question.ok 가 없다`);
    if (q.ok) {
      for (const k of ['question', 'answer', 'explanation']) {
        if (!q[k]) throw new Error(`${file}: [${i}] question.${k} 가 비었다`);
      }
      if (!Array.isArray(q.acceptedAnswers)) {
        throw new Error(`${file}: [${i}] acceptedAnswers 가 배열이 아니다`);
      }
      for (const k of ['accessibility', 'difficulty', 'worthKnowing']) {
        if (!Number.isInteger(q[k]) || q[k] < 1 || q[k] > 5) {
          throw new Error(`${file}: [${i}] ${k} 가 1~5 정수가 아니다 (${q[k]})`);
        }
      }
      if (!q.selfCheck) throw new Error(`${file}: [${i}] selfCheck 가 없다`);
    } else if (!q.rejectReason) {
      throw new Error(`${file}: [${i}] ok:false 인데 rejectReason 이 없다`);
    }
  }

  const key = `${batch.round}:${batch.subId}`;
  if (state.subs[key]?.ingestedAt && !FORCE) {
    console.log(`[skip] ${key} 는 이미 반영됐다 (${state.subs[key].ingestedAt})`);
    continue;
  }

  const { seedIds, addedAnswers } = await ingestBatch(batch);

  // ── 생성 결과 본문 저장 (라운드 산출물)
  const outDir = generatedDir(batch.round);
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slugOf(batch.subId)}.json`);
  const doc = {
    _meta: {
      round: batch.round,
      subId: batch.subId,
      categoryPath: r.path,
      midKey: r.midKey,
      subName: r.subName,
      majorKey: r.majorKey,
      seedPrompt: batch.seedPrompt,
      // ★ 소재만 넣은 단계에서는 아직 모른다. seeds-attach.mjs 가 채운다
      questionPrompt: batch.questionPrompt ?? null,
      generator: batch.generator,
      generatedAt: batch.generatedAt,
      seedResult: batch.seedResult ?? null,
      stage: seedsOnly ? 'seeds' : 'seeds+questions',
    },
    items: rows.map((it, i) => ({
      seedId: seedIds[i],
      seed: it.seed,
      // ★ 아직 문제가 없으면 pending 으로 둔다. 문제 세션의 입력이 된다
      question: it.question ?? { status: 'pending' },
    })),
  };
  await writeFile(outFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  const ok = rows.filter((it) => it.question?.ok).length;
  const pending = rows.filter((it) => !it.question).length;
  state.subs[key] = {
    subId: batch.subId,
    categoryPath: r.path,
    seeds: rows.length,
    questionsPending: pending,
    questionsOk: ok,
    questionsRejected: rows.length - ok - pending,
    ingestedAt: new Date().toISOString(),
    file: path.relative(process.cwd(), outFile).split(path.sep).join('/'),
  };
  state.round ??= batch.round;
  state.startedAt ??= new Date().toISOString();
  state.log.push(
    `${new Date().toISOString()} ingest ${key} seeds=${rows.length} ok=${ok} pending=${pending}`,
  );
  console.log(
    `[ok] ${key.padEnd(28)} 소재 ${String(rows.length).padStart(2)} / 문제 ${pending ? `대기 ${pending}` : `성공 ${ok}`} / usedAnswers +${addedAnswers}`,
  );
}

await saveState(state);
const done = Object.keys(state.subs).length;
console.log(`\n[state] 반영된 소분류 ${done}개 → data/pipeline/seeds/_state.json`);
