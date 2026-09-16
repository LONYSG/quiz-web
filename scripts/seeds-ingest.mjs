#!/usr/bin/env node
// =============================================================================
// 배치 파일(소재 + 문제)을 소재 저장소와 생성 결과 디렉터리에 반영한다 (R017 작업 A)
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

for (const file of files) {
  const batch = JSON.parse(await readFile(file, 'utf8'));

  // ── 형식 검사. 조용히 통과시키지 않는다
  for (const k of ['round', 'subId', 'seedPrompt', 'questionPrompt', 'generator', 'items']) {
    if (!batch[k]) throw new Error(`${file}: 필수 필드 없음 — ${k}`);
  }
  const r = resolveSubId(batch.subId);
  if (batch.subName && batch.subName !== r.subName) {
    throw new Error(`${file}: 소분류 이름 불일치 — "${batch.subName}" vs "${r.subName}"`);
  }
  batch.generatedAt ??= new Date().toISOString();

  for (const [i, it] of batch.items.entries()) {
    if (!it.seed?.subject || !it.seed?.aspect || !it.seed?.knowledgePoint) {
      throw new Error(`${file}: items[${i}] 소재 필드가 비었다`);
    }
    const q = it.question;
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
      questionPrompt: batch.questionPrompt,
      generator: batch.generator,
      generatedAt: batch.generatedAt,
      seedResult: batch.seedResult ?? null,
    },
    items: batch.items.map((it, i) => ({ seedId: seedIds[i], ...it })),
  };
  await writeFile(outFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  const ok = batch.items.filter((it) => it.question.ok).length;
  state.subs[key] = {
    subId: batch.subId,
    categoryPath: r.path,
    seeds: batch.items.length,
    questionsOk: ok,
    questionsRejected: batch.items.length - ok,
    ingestedAt: new Date().toISOString(),
    file: path.relative(process.cwd(), outFile).split(path.sep).join('/'),
  };
  state.round ??= batch.round;
  state.startedAt ??= new Date().toISOString();
  state.log.push(`${new Date().toISOString()} ingest ${key} seeds=${batch.items.length} ok=${ok}`);
  console.log(
    `[ok] ${key.padEnd(28)} 소재 ${batch.items.length} / 문제 성공 ${ok} / usedAnswers +${addedAnswers}`,
  );
}

await saveState(state);
const done = Object.keys(state.subs).length;
console.log(`\n[state] 반영된 소분류 ${done}개 → data/pipeline/seeds/_state.json`);
