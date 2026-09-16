// =============================================================================
// 소재(seed) 저장소 (R017 / 작업 A)
//
// ★★ DB 에 쓰지 않는다. 파일로만 쌓는다 (R017 0장).
//
// ─────────────────────────────────────────────────────────────────────────────
// ★ 구조 판단과 근거
//
//   data/pipeline/seeds/<midKey>.json      ★ 중분류 하나당 파일 하나
//
//   (가) 왜 소분류당 파일이 아닌가
//     · 소분류는 297개다. 파일 297개는 git 로그에서 읽기 어렵다
//     · ★ 소분류 이름에 공백·가운뎃점·괄호가 들어가 파일명으로 위험하다 (subid.mjs 참조)
//   (나) 왜 전체 한 파일이 아닌가
//     · ★ 한 라운드에 소분류 20개를 돌리면 같은 파일을 20번 덮어쓴다.
//       중간에 끊기면 무엇이 저장됐는지 알 수 없다
//     · git diff 가 매번 수천 줄이 되어 검토가 불가능해진다
//   → 중분류 63개가 절충점이다. 한 번에 쓰는 파일이 하나뿐이라 원자성도 확보된다
//
//   (다) 왜 생성 결과(문제)는 별도 디렉터리인가
//     data/pipeline/generated/<round>/<slug>.json
//     · ★ 소재 이력은 **영구 누적**이고, 문제는 **라운드 산출물**이다. 수명이 다르다
//     · 소재 이력 파일이 문제 본문까지 담으면 금지 목록을 읽을 때마다
//       쓸데없이 큰 파일을 읽게 된다
//     · 소재 파일에는 그 소재가 어떤 문제가 됐는지 **참조와 결과만** 남긴다
//
//   (라) ★ 중단·재개
//     data/pipeline/seeds/_state.json 에 소분류별 진행 상태를 남긴다.
//     ingest 가 끝날 때마다 갱신한다. 세션이 끊겨도 어디까지 했는지 알 수 있다
// ─────────────────────────────────────────────────────────────────────────────
//
// ★★ usedAnswers 는 자동 금지 목록이 **아니다** (R017 작업 A).
//   같은 답이라도 knowledgePoint 가 다르면 허용된다.
//   그래서 이 파일은 usedAnswers 로 무엇도 걸러내지 않는다. **목록을 건네줄 뿐이다.**
//   판단은 프롬프트 A 를 실행하는 모델이 한다.
// =============================================================================

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findMid, findMajor } from '../dist/categories.js';
import { assertSubName, resolveSubId, slugOf } from './subid.mjs';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SEEDS_DIR = path.join(ROOT, 'data', 'pipeline', 'seeds');
export const STATE_FILE = path.join(SEEDS_DIR, '_state.json');
export const generatedDir = (round) => path.join(ROOT, 'data', 'pipeline', 'generated', round);

const midFile = (midKey) => path.join(SEEDS_DIR, `${midKey}.json`);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  // ★ LF 로 쓴다. 저장소 전체 규칙이다 (.gitattributes)
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`.replace(/\r\n/g, '\n'), 'utf8');
}

/** 중분류 파일을 읽는다. 없으면 빈 구조를 만든다 */
export async function loadMid(midKey) {
  const mid = findMid(midKey);
  if (!mid) throw new Error(`중분류를 찾을 수 없다: ${midKey}`);
  const major = findMajor(mid.major);
  const doc = await readJson(midFile(midKey), null);
  if (doc) {
    // ★ 저장된 소분류 이름을 현재 트리와 대조한다
    for (const [subId, bucket] of Object.entries(doc.subs ?? {})) {
      assertSubName(subId, bucket.subName);
    }
    return doc;
  }
  return {
    midKey,
    midName: mid.nameKo,
    majorKey: mid.major,
    majorName: major?.nameKo ?? mid.major,
    updatedAt: null,
    subs: {},
  };
}

export async function saveMid(doc) {
  doc.updatedAt = new Date().toISOString();
  await writeJson(midFile(doc.midKey), doc);
}

function ensureBucket(doc, subId) {
  const r = resolveSubId(subId);
  if (r.midKey !== doc.midKey) throw new Error(`중분류가 다르다: ${subId} vs ${doc.midKey}`);
  if (!doc.subs[subId]) {
    doc.subs[subId] = { subName: r.subName, usedAnswers: [], seeds: [] };
  }
  return doc.subs[subId];
}

/**
 * ★ 프롬프트 A 에 넣을 금지 목록을 만든다.
 *
 *   usedSeeds    이 소분류에서 **전체 이력** (최근 N개가 아니다 — R017 1장 근거 참조)
 *   usedAnswers  이 소분류의 대표 정답 전체 (기존 DB 문제 + 이 파이프라인 생성분)
 *
 * ★★ 다른 소분류의 이력은 넣지 않는다. 전역 중복은 4차 단계에서 처리한다.
 */
export async function banlistFor(subId) {
  const r = resolveSubId(subId);
  const doc = await loadMid(r.midKey);
  const bucket = doc.subs[subId];
  if (!bucket) return { ...r, usedSeeds: [], usedAnswers: [] };
  return {
    ...r,
    usedSeeds: bucket.seeds.map((s) => ({
      subject: s.subject,
      aspect: s.aspect,
      knowledgePoint: s.knowledgePoint,
    })),
    usedAnswers: bucket.usedAnswers.map((a) => a.answer),
  };
}

/** 기존 DB 문제의 정답을 usedAnswers 초기값으로 넣는다 (중복 항목은 무시) */
export async function seedUsedAnswersFromDb(subId, entries) {
  const r = resolveSubId(subId);
  const doc = await loadMid(r.midKey);
  const bucket = ensureBucket(doc, subId);
  let added = 0;
  for (const e of entries) {
    if (bucket.usedAnswers.some((a) => a.origin === e.origin)) continue;
    bucket.usedAnswers.push({ answer: e.answer, origin: e.origin, note: e.note ?? null });
    added += 1;
  }
  await saveMid(doc);
  return added;
}

/**
 * 한 소분류의 배치(소재 + 그 소재로 만든 문제)를 저장소에 반영한다.
 *
 * @returns { seedIds, addedAnswers }
 */
export async function ingestBatch(batch) {
  const r = resolveSubId(batch.subId);
  const doc = await loadMid(r.midKey);
  const bucket = ensureBucket(doc, batch.subId);

  const startNo = bucket.seeds.length;
  const seedIds = [];
  let addedAnswers = 0;

  batch.items.forEach((item, i) => {
    const no = String(startNo + i + 1).padStart(3, '0');
    const seedId = `${batch.subId}#${no}`;
    seedIds.push(seedId);
    const q = item.question ?? {};
    bucket.seeds.push({
      seedId,
      subject: item.seed.subject,
      aspect: item.seed.aspect,
      knowledgePoint: item.seed.knowledgePoint,
      round: batch.round,
      seedPrompt: batch.seedPrompt,
      generator: batch.generator,
      createdAt: batch.generatedAt,
      // ★ 그 소재로 만든 문제의 결과. 본문은 generated/ 에 있다
      question: {
        status: q.ok === true ? 'ok' : q.ok === false ? 'rejected' : 'none',
        ref: `${batch.round}/${slugOf(batch.subId)}#${no}`,
        answer: q.ok === true ? q.answer : null,
        rejectReason: q.ok === false ? (q.rejectReason ?? '(사유 없음)') : null,
        questionPrompt: batch.questionPrompt,
      },
    });
    if (q.ok === true && q.answer) {
      bucket.usedAnswers.push({
        answer: q.answer,
        origin: `${batch.round}:${seedId}`,
        note: null,
      });
      addedAnswers += 1;
    }
  });

  await saveMid(doc);
  return { seedIds, addedAnswers };
}

export async function loadState() {
  return readJson(STATE_FILE, { round: null, startedAt: null, subs: {}, log: [] });
}

export async function saveState(state) {
  state.updatedAt = new Date().toISOString();
  await writeJson(STATE_FILE, state);
}

/** 저장소 전체를 훑는다 (보고·검사용) */
export async function readAllMids() {
  let names = [];
  try {
    names = (await readdir(SEEDS_DIR)).filter((n) => n.endsWith('.json') && !n.startsWith('_'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const out = [];
  for (const n of names) out.push(await readJson(path.join(SEEDS_DIR, n), null));
  return out.filter(Boolean);
}
