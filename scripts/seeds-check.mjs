#!/usr/bin/env node
// =============================================================================
// 규칙 검사 + 중복 후보 추리기 (라운드 중립. R017 에서 r017-check.mjs 였다) — API 를 쓰지 않는다. DB 는 읽기만 한다
//
// ★★ shared 의 normalizeAnswer() / generateHint() 를 **그대로 재사용한다.**
//   파이프라인용으로 다시 만들지 않는다. 두 곳이 다르면 어느 쪽이 맞는지 알 수 없다.
//
// ★★ 질문에 정답이 노출됐는지 검사할 때 **부분 문자열 포함만으로 자동 탈락시키지 않는다.**
//   한국어에서는 오탐이 많다 — 정답 "금" 이 질문의 "황금기" 에 우연히 들어가는 식이다.
//   → 두 단계로 나눈다.
//     expose        정답 전체가 질문에 **낱말 경계를 갖추고** 들어갔다. 실제 노출로 본다
//     exposeSuspect 문자열로는 들어 있으나 낱말 경계가 아니다. **탈락시키지 않고 격리**한다
//   ★ 판정은 정규화 문자열이 아니라 원문에서 한다 —
//     정규화는 공백을 지우므로 "황금 기" 와 "황금기" 를 구별할 수 없다.
// =============================================================================

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { normalizeAnswer, generateHint } from '../shared/dist/index.js';
import { generatedDir } from '../pipeline/lib/seedstore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const ROUND = process.argv[2] ?? 'r017';
// ★★ R018: 다른 라운드와의 대조를 더했다.
//   R017 은 "신규 안쪽" 과 "기존 DB" 두 방향만 쟀다. 소분류 **사이** 중복을 재지 못한 까닭이
//   한 라운드 안에 소분류 20개밖에 없었기 때문이다.
//   → 라운드가 쌓이면 라운드끼리 대조해야 그 구멍이 메워진다.
const againstIdx = process.argv.indexOf('--against');
const AGAINST = againstIdx >= 0 ? process.argv[againstIdx + 1].split(',') : [];
const dir = generatedDir(ROUND);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();

const items = [];
let discarded = 0;
for (const f of files) {
  const doc = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  for (const it of doc.items) {
    if (!it.question.ok) continue;
    // ★ 격리된 문항은 적재 대상이 아니므로 검사·중복 후보에서 뺀다 (seeds-discard.mjs)
    if (it.question.discarded) {
      discarded += 1;
      continue;
    }
    items.push({
      ref: it.seedId,
      subId: doc._meta.subId,
      categoryPath: doc._meta.categoryPath,
      majorKey: doc._meta.majorKey,
      seed: it.seed,
      q: it.question,
    });
  }
}
console.log(`[입력] ${ROUND} 성공 문제 ${items.length}건 (파일 ${files.length}개)` +
  (discarded ? ` / ★ 격리 ${discarded}건은 제외했다` : ''));

const findings = {
  normCollisionInside: [],
  hintNull: [],
  hintEqualsAnswer: [],
  variantCollision: [],
  expose: [],
  exposeSuspect: [],
  longAnswer: [],
  numeric: [],
};

// ── 1. 정답 정규화 충돌 (신규 200건 안에서)
const byNorm = new Map();
for (const it of items) {
  const n = normalizeAnswer(it.q.answer);
  const arr = byNorm.get(n) ?? [];
  arr.push(it);
  byNorm.set(n, arr);
}
for (const [n, arr] of byNorm) {
  if (arr.length > 1) {
    findings.normCollisionInside.push({
      norm: n,
      refs: arr.map((x) => `${x.ref} (${x.categoryPath})`),
    });
  }
}

// ── 2. 힌트
for (const it of items) {
  const h = generateHint(it.q.answer);
  if (h === null) findings.hintNull.push({ ref: it.ref, answer: it.q.answer });
  else if (normalizeAnswer(h) === normalizeAnswer(it.q.answer)) {
    findings.hintEqualsAnswer.push({ ref: it.ref, answer: it.q.answer, hint: h });
  }
  it.hint = h;
}

// ── 3. acceptedAnswers 가 대표 정답과 정규화 후 같아지는가
for (const it of items) {
  const seen = new Set([normalizeAnswer(it.q.answer)]);
  for (const v of it.q.acceptedAnswers) {
    const nv = normalizeAnswer(v);
    if (seen.has(nv)) findings.variantCollision.push({ ref: it.ref, answer: it.q.answer, variant: v });
    seen.add(nv);
  }
}

// ── 4. 질문에 정답이 노출됐는가
const BOUNDARY_SRC = '[\\s.,!?\'"()\\[\\]{}·~:;/\\u2018\\u2019\\u201c\\u201d\\u2013\\u2014-]';
const BOUNDARY = new RegExp(BOUNDARY_SRC);

function findInQuestion(question, answer) {
  const q = question.normalize('NFC');
  const a = answer.normalize('NFC').trim();
  if (a.length === 0) return 'none';
  let from = 0;
  let sawSubstring = false;
  for (;;) {
    const i = q.indexOf(a, from);
    if (i < 0) break;
    sawSubstring = true;
    const before = i === 0 ? '' : q[i - 1];
    const after = i + a.length >= q.length ? '' : q[i + a.length];
    const okBefore = before === '' || BOUNDARY.test(before);
    const okAfter = after === '' || BOUNDARY.test(after);
    if (okBefore && okAfter) return 'word';
    from = i + 1;
  }
  return sawSubstring ? 'substring' : 'none';
}

for (const it of items) {
  for (const cand of [it.q.answer, ...it.q.acceptedAnswers]) {
    const kind = findInQuestion(it.q.question, cand);
    if (kind === 'word') {
      findings.expose.push({ ref: it.ref, answer: cand, question: it.q.question });
      break;
    }
    if (kind === 'substring') {
      findings.exposeSuspect.push({ ref: it.ref, answer: cand, question: it.q.question });
      break;
    }
  }
}

// ── 5. 서술형·긴 정답 / 숫자 정답
for (const it of items) {
  const a = it.q.answer;
  if ([...a].length >= 12 || /(습니다|이다|한다|였다)$/.test(a)) {
    findings.longAnswer.push({ ref: it.ref, answer: a, len: [...a].length });
  }
  if (/^\d+(\.\d+)?$/.test(a.trim())) findings.numeric.push({ ref: it.ref, answer: a });
}

// ── 6. 기존 DB 와의 정규화 충돌 (중복 판정 후보의 입력이기도 하다)
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb',
});
await client.connect();
const dbRows = (
  await client.query(`
    SELECT q.id, q.question_text, q.display_answer, q.is_active, q.source_id,
           t.mid_key, t.sub_name, t.major_key
      FROM questions q LEFT JOIN category_tree t ON q.category_id = t.category_id`)
).rows;
const dbAns = (await client.query('SELECT question_id, answer_text FROM question_answers')).rows;
await client.end();

const dbAnsByQ = new Map();
for (const a of dbAns) {
  const k = String(a.question_id);
  const arr = dbAnsByQ.get(k) ?? [];
  arr.push(a.answer_text);
  dbAnsByQ.set(k, arr);
}
const dbByNorm = new Map();
for (const r of dbRows) {
  for (const a of dbAnsByQ.get(String(r.id)) ?? [r.display_answer]) {
    const n = normalizeAnswer(a);
    const arr = dbByNorm.get(n) ?? [];
    if (!arr.some((x) => x.id === r.id)) arr.push(r);
    dbByNorm.set(n, arr);
  }
}

// ── 후보 쌍 만들기
const pairsInside = [];
for (const [, arr] of byNorm) {
  if (arr.length < 2) continue;
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = i + 1; j < arr.length; j += 1) pairsInside.push([arr[i], arr[j]]);
  }
}

// ★ acceptedAnswers 까지 포함해 기존 문제와의 후보를 넓힌다
const newByAnyNorm = new Map();
for (const it of items) {
  for (const a of [it.q.answer, ...it.q.acceptedAnswers]) {
    const n = normalizeAnswer(a);
    const arr = newByAnyNorm.get(n) ?? [];
    if (!arr.includes(it)) arr.push(it);
    newByAnyNorm.set(n, arr);
  }
}
const pairsVsDb = [];
const seenPair = new Set();
for (const [n, arr] of newByAnyNorm) {
  const hits = dbByNorm.get(n);
  if (!hits) continue;
  for (const it of arr) {
    for (const r of hits) {
      const key = `${it.ref}|${r.id}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      pairsVsDb.push({ newItem: it, dbRow: r });
    }
  }
}

// ── 다른 라운드와의 대조
const crossRounds = [];
for (const other of AGAINST) {
  const odir = generatedDir(other);
  let ofiles = [];
  try {
    ofiles = (await readdir(odir)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[대조] ${other} 라운드가 없다. 건너뛴다`);
      continue;
    }
    throw err;
  }
  const oitems = [];
  for (const f of ofiles) {
    const doc = JSON.parse(await readFile(path.join(odir, f), 'utf8'));
    for (const it of doc.items) {
      if (!it.question.ok || it.question.discarded) continue;
      oitems.push({ ref: it.seedId, cat: doc._meta.categoryPath, q: it.question });
    }
  }
  // ★ 정규화한 정답(+표기 변형)이 겹치는 쌍만 후보로 올린다. 전수 비교를 하지 않는다
  const oByNorm = new Map();
  for (const it of oitems) {
    for (const a of [it.q.answer, ...it.q.acceptedAnswers]) {
      const n = normalizeAnswer(a);
      const arr = oByNorm.get(n) ?? [];
      if (!arr.includes(it)) arr.push(it);
      oByNorm.set(n, arr);
    }
  }
  const pairs = [];
  const seen = new Set();
  for (const it of items) {
    for (const a of [it.q.answer, ...it.q.acceptedAnswers]) {
      for (const o of oByNorm.get(normalizeAnswer(a)) ?? []) {
        const key = `${it.ref}|${o.ref}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({
          a: { ref: it.ref, cat: it.categoryPath, q: it.q.question, ans: it.q.answer },
          b: { ref: o.ref, cat: o.cat, q: o.q.question, ans: o.q.answer },
        });
      }
    }
  }
  crossRounds.push({ round: other, items: oitems.length, allPairs: items.length * oitems.length, pairs });
}

const totalNewPairs = (items.length * (items.length - 1)) / 2;
const totalCrossPairs = items.length * dbRows.length;

const report = {
  round: ROUND,
  generatedAt: new Date().toISOString(),
  counts: {
    items: items.length,
    dbQuestions: dbRows.length,
    allPairsInside: totalNewPairs,
    candidatePairsInside: pairsInside.length,
    allPairsVsDb: totalCrossPairs,
    candidatePairsVsDb: pairsVsDb.length,
    crossRounds: crossRounds.map((c) => ({
      round: c.round,
      items: c.items,
      allPairs: c.allPairs,
      candidatePairs: c.pairs.length,
    })),
  },
  findings,
  pairsVsRounds: crossRounds,
  pairsInside: pairsInside.map(([a, b]) => ({
    a: { ref: a.ref, cat: a.categoryPath, q: a.q.question, ans: a.q.answer },
    b: { ref: b.ref, cat: b.categoryPath, q: b.q.question, ans: b.q.answer },
  })),
  pairsVsDb: pairsVsDb.map(({ newItem, dbRow }) => ({
    a: { ref: newItem.ref, cat: newItem.categoryPath, q: newItem.q.question, ans: newItem.q.answer },
    b: {
      ref: `db:${dbRow.id}`,
      cat: dbRow.mid_key ? `${dbRow.mid_key} > ${dbRow.sub_name}` : '(소분류 없음)',
      q: dbRow.question_text,
      ans: dbRow.display_answer,
      isActive: dbRow.is_active,
    },
  })),
};

await mkdir(path.join(ROOT, 'data', 'pipeline', 'dedupe'), { recursive: true });
const out = path.join(ROOT, 'data', 'pipeline', 'dedupe', `${ROUND}-candidates.json`);
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('\n── 규칙 검사');
for (const [k, v] of Object.entries(findings)) console.log(`  ${k.padEnd(22)} ${v.length}`);
console.log('\n── 중복 후보 추리기');
console.log(
  `  신규 안쪽   전체 ${totalNewPairs}쌍 → 후보 ${pairsInside.length}쌍 (${((pairsInside.length / totalNewPairs) * 100).toFixed(3)}%)`,
);
console.log(
  `  기존 DB     전체 ${totalCrossPairs}쌍 → 후보 ${pairsVsDb.length}쌍 (${((pairsVsDb.length / totalCrossPairs) * 100).toFixed(3)}%)`,
);
for (const c of crossRounds) {
  console.log(
    `  ${c.round} 대조  전체 ${c.allPairs}쌍 → 후보 ${c.pairs.length}쌍 (${((c.pairs.length / c.allPairs) * 100).toFixed(3)}%)`,
  );
}
console.log(`\n  → ${path.relative(ROOT, out).split(path.sep).join('/')}`);
