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
// ★★ R022 — 격리로 빠진 문항을 **파일에 남긴다.**
//   R021 에서 판정 대기 목록을 "후보 − 판정된 것" 으로 만들었는데, 그 사이에 격리된 3건이
//   후보에서 조용히 빠졌다 (V001 이 찾은 웨스트엔드·토니상·커튼콜). ★ 왜 빠졌는지 보여 주는 기록이 없었다.
const excluded = [];
for (const f of files) {
  const doc = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  for (const it of doc.items) {
    if (!it.question.ok) continue;
    // ★ 격리된 문항은 적재 대상이 아니므로 검사·중복 후보에서 뺀다 (seeds-discard.mjs)
    if (it.question.discarded) {
      discarded += 1;
      excluded.push({ ref: it.seedId, answer: it.question.answer, reason: it.question.discarded.reason ?? null, at: it.question.discarded.at ?? null, duplicateOf: it.question.discarded.duplicateOf ?? null });
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
//
// ★★ R021 — **숫자만으로 된 정답은 이 검사에서 제외한다** (C24 확정, D-097).
//   ★ 근거 (1) 야구 심판진 4명 / 교향곡 악장 4개 / 심장의 방 4개 는
//     **맞히게 해 주는 지식이 완전히 다르다** (Q-91 기준. D-091 이 우선한다)
//   ★ 근거 (2) 게임이 **한 판에 같은 정답이 두 번 나오지 않도록 이미 막고 있다** (Q-76).
//     DB 에 여럿 있어도 체감 중복이 생기지 않는다
//   ★ 라운드 **밖**(다른 라운드·DB) 은 그대로 둔다 — 그쪽은 LLM 판정을 거치므로
//     ★★ "정답이 같아도 지식이 다르면 중복이 아니다"(D-091)가 거기서 적용된다.
const isNumericOnly = (a) => /^\d+(\.\d+)?$/.test((a ?? '').trim());
const byNorm = new Map();
for (const it of items) {
  if (isNumericOnly(it.q.answer)) continue; // ★ D-097
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
    SELECT q.id, q.question_text, q.display_answer, q.is_active, q.source_id, q.source_ref,
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
// ★★ R022 — 2회차 짝(pairedWith) 면제 (C28 확정 / D-102)
//   2회차는 일부러 1회차와 같은 답을 쓴다. 그 짝과의 충돌만 후보에서 뺀다.
//   ★ 짝이 아닌 것과의 충돌은 그대로 잡는다 (R021 파일럿의 동소체·석굴암 사례).
//   ★ 면제한 쌍은 exemptedPairs 에 남겨 VERIFY 가 볼 수 있게 한다.
const exemptedPairs = [];
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
      if (it.q.pairedWith && r.source_ref === it.q.pairedWith) {
        exemptedPairs.push({ scope: 'vs-db', a: it.ref, b: `db:${r.id}`, pairedWith: it.q.pairedWith, answer: it.q.answer });
        continue;
      }
      pairsVsDb.push({ newItem: it, dbRow: r });
    }
  }
}
const inDbByRef = new Map(dbRows.filter((r) => r.source_ref).map((r) => [r.source_ref, r]));

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
  let coveredByDb = 0;
  for (const it of items) {
    for (const a of [it.q.answer, ...it.q.acceptedAnswers]) {
      for (const o of oByNorm.get(normalizeAnswer(a)) ?? []) {
        const key = `${it.ref}|${o.ref}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (it.q.pairedWith && o.ref === it.q.pairedWith) {
          exemptedPairs.push({ scope: `vs-${other}`, a: it.ref, b: o.ref, pairedWith: it.q.pairedWith, answer: it.q.answer });
          continue;
        }
        // ★★ R022 — 이미 DB 에 적재된 문항이고 같은 쌍이 DB 대조에도 있으면 여기서는 올리지 않는다.
        //   V001 에서 같은 두 문항을 두 번 판정해 keep 이 엇갈린 것이 11건이었다. 한 번만 묻는다.
        const loaded = inDbByRef.get(o.ref);
        if (loaded && seenPair.has(`${it.ref}|${loaded.id}`)) { coveredByDb += 1; continue; }
        pairs.push({
          a: { ref: it.ref, cat: it.categoryPath, q: it.q.question, ans: it.q.answer },
          b: { ref: o.ref, cat: o.cat, q: o.q.question, ans: o.q.answer },
        });
      }
    }
  }
  crossRounds.push({ round: other, items: oitems.length, allPairs: items.length * oitems.length, coveredByDb, pairs });
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
  // ★★ R022 — 격리로 빠진 것 / 짝 면제로 빠진 것을 모두 적는다. 조용히 빠지는 것이 없게 한다
  excluded,
  exemptedPairs,
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

// ★★ R022 — 문항별 묶음. 같은 문항이 여러 쌍에 걸리면 한 묶음으로 판정하라는 운영 지시를 돕는다.
//   ★ VERIFY 가 배치를 나눌 때 이 묶음 단위로 나누면 같은 문항의 판정이 배치마다 갈리지 않는다.
{
  const g = new Map();
  const add = (ref, scope, other) => { if (!g.has(ref)) g.set(ref, []); g.get(ref).push({ scope, other }); };
  for (const p of report.pairsInside) { add(p.a.ref, 'inside', p.b.ref); add(p.b.ref, 'inside', p.a.ref); }
  for (const c of crossRounds) for (const p of c.pairs) add(p.a.ref, `vs-${c.round}`, p.b.ref);
  for (const p of report.pairsVsDb) add(p.a.ref, 'vs-db', p.b.ref);
  report.byNewItem = [...g.entries()].map(([ref, pairs]) => ({ ref, pairCount: pairs.length, pairs })).sort((x, y) => y.pairCount - x.pairCount);
  report.counts.excluded = excluded.length;
  report.counts.exemptedPairs = exemptedPairs.length;
  report.counts.itemsWithCandidates = report.byNewItem.length;
}

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
    `  ${c.round} 대조  전체 ${c.allPairs}쌍 → 후보 ${c.pairs.length}쌍 (${((c.pairs.length / c.allPairs) * 100).toFixed(3)}%)` +
      (c.coveredByDb ? ` / ★ DB 대조와 같은 쌍 ${c.coveredByDb}개는 뺐다` : ''),
  );
}
console.log(`\n  → ${path.relative(ROOT, out).split(path.sep).join('/')}`);
console.log(`\n── ★ 빠진 것 (R022)`);
console.log(`  격리로 빠진 문항         ${excluded.length}건   → excluded`);
console.log(`  2회차 짝이라 면제한 쌍   ${exemptedPairs.length}쌍   → exemptedPairs`);
console.log(`  후보가 걸린 신규 문항    ${report.byNewItem.length}건   → byNewItem (VERIFY 배치 단위)`);
