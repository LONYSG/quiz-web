#!/usr/bin/env node
// =============================================================================
// 적재된 문제들 사이의 중복을 사후에 찾아 정리한다 (R012 작업 D-4)
//
// ★★ 건우 의견: "LLM 모델이 DB에 직접 붙어서 내용 확인해서 중복 제거 작업을 수행할 수 있을 것 같다."
//
// ★ 지금까지는 **적재 전 파일 단계**에서만 검사했다. 그래서 —
//   · 다른 날 만든 배치 사이의 중복을 못 잡는다
//   · 시드 문제(53건)와 생성 문제 사이의 중복을 못 잡는다
//   → DB 에 붙어 전체를 한 번에 본다.
//
// ★★ 자동으로 지우지 않는다.
//   is_active 를 내리는 것으로 처리하고 이력을 남긴다.
//   ★ 근거: status 를 되돌리면 검수 이력이 오염된다 (11-DEPLOY 의 기존 원칙).
//   ★ 그리고 --apply 를 주지 않으면 아무것도 바꾸지 않는다.
//
// 사용법
//   node scripts/pipeline-dedupe-db.mjs                 후보만 보고 끝낸다
//   node scripts/pipeline-dedupe-db.mjs --judge          LLM 판정까지 한다 (변경 없음)
//   node scripts/pipeline-dedupe-db.mjs --judge --apply  ★ is_active 를 내린다
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { normalizeAnswer } from '../shared/dist/index.js';
import { MODELS } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { GeminiClient } from '../pipeline/dist/gemini.js';
import { findDuplicates } from '../pipeline/dist/dedupe.js';
import { DUPE_JUDGE_SCHEMA, buildDupeJudgePrompt } from '../pipeline/dist/dedupe-llm.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const args = process.argv.slice(2);
const JUDGE = args.includes('--judge');
const APPLY = args.includes('--apply');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. 출제 대상 문제와 정답을 모두 읽는다
  //   ★ 카테고리는 계층 뷰(0003 마이그레이션)에서 가져온다.
  //     ★ 뷰가 없으면 소분류를 못 찾으므로 대분류만이라도 채운다
  // ─────────────────────────────────────────────────────────────────────────
  const hasTree = (
    await client.query(`SELECT 1 FROM information_schema.views WHERE table_name = 'category_tree'`)
  ).rowCount > 0;

  const sql = hasTree
    ? `SELECT q.id, q.question_text, q.display_answer, q.source_id, q.is_active,
              coalesce(t.mid_key, 'legacy:' || c.key)   AS mid_key,
              coalesce(t.major_key, 'legacy:' || c.key) AS major_key
         FROM questions q
         JOIN categories c ON q.category_id = c.id
         LEFT JOIN category_tree t ON q.category_id = t.category_id
        WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'`
    : `SELECT q.id, q.question_text, q.display_answer, q.source_id, q.is_active,
              'legacy:' || c.key AS mid_key, 'legacy:' || c.key AS major_key
         FROM questions q
         JOIN categories c ON q.category_id = c.id
        WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'`;

  const qs = (await client.query(sql)).rows;
  const ans = (
    await client.query(
      `SELECT question_id, answer_text FROM question_answers
        WHERE question_id = ANY($1::bigint[])`,
      [qs.map((r) => r.id)],
    )
  ).rows;

  const answersById = new Map();
  for (const a of ans) {
    const arr = answersById.get(String(a.question_id)) ?? [];
    arr.push(a.answer_text);
    answersById.set(String(a.question_id), arr);
  }

  console.log(`[db] 출제 대상 ${qs.length}건 / 정답 표기 ${ans.length}개`);
  console.log(`[db] 카테고리 계층 뷰: ${hasTree ? '있다 (0003 적용됨)' : '★ 없다 — 대분류만으로 판단한다'}`);
  const bySource = {};
  for (const r of qs) bySource[r.source_id] = (bySource[r.source_id] ?? 0) + 1;
  console.log(`[db] 소스별: ${JSON.stringify(bySource)}`);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. 후보 추리기 (무료) — 파일 단계와 **같은 함수**를 쓴다
  //   ★ 두 곳에서 다른 규칙을 쓰면 어느 쪽이 맞는지 알 수 없다
  // ─────────────────────────────────────────────────────────────────────────
  const report = findDuplicates(
    qs.map((r) => ({
      ref: String(r.id),
      midKey: r.mid_key ?? '',
      majorKey: r.major_key ?? '',
      question: r.question_text,
      answers: answersById.get(String(r.id)) ?? [r.display_answer],
    })),
  );
  console.log(
    `[db] 전수 비교라면 ${report.totalPairsIfBruteForce}쌍 / ★ 정답으로 좁힌 후보 ${report.candidatePairs}쌍`,
  );

  const byId = new Map(qs.map((r) => [String(r.id), r]));
  for (const p of report.pairs) {
    const a = byId.get(p.a);
    const b = byId.get(p.b);
    console.log(`  [${p.level}] "${p.sharedAnswer}"`);
    console.log(`     #${p.a} (${a.source_id}) ${a.question_text}`);
    console.log(`     #${p.b} (${b.source_id}) ${b.question_text}`);
  }

  if (report.pairs.length === 0) {
    console.log('[db] 후보가 없다. 정리할 것이 없다.');
    process.exit(0);
  }
  if (!JUDGE) {
    console.log('\n[db] --judge 를 주면 LLM 판정까지 한다.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. LLM 판정
  // ─────────────────────────────────────────────────────────────────────────
  const state = await loadState(ROOT);
  const gate = checkGate(state);
  if (!gate.ok) {
    console.error(`[db] ★ 판정을 시작하지 않는다 — ${gate.detail}`);
    process.exit(0);
  }
  const gem = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });

  const pairs = report.pairs.map((p, i) => {
    const a = byId.get(p.a);
    const b = byId.get(p.b);
    const mk = (r) => ({
      ref: String(r.id),
      question: r.question_text,
      answer: r.display_answer,
      category: r.mid_key,
      accessibility: 0,
      worthKnowing: 0,
      answerCount: (answersById.get(String(r.id)) ?? []).length,
    });
    return { pairId: `p${i + 1}`, a: mk(a), b: mk(b), level: p.level, sharedAnswer: p.sharedAnswer };
  });

  const r = await gem.generateWithChain(
    [...MODELS.backcheckChain],
    buildDupeJudgePrompt(pairs),
    DUPE_JUDGE_SCHEMA,
    { maxOutputTokens: 8192 },
  );
  closeSegment(state, false);
  await saveState(ROOT, state);
  console.log(`[db] 판정 ${pairs.length}쌍 [${r.model}] (토큰 ${r.usage.total})`);

  const judged = new Map((r.value.items ?? []).map((j) => [j.pairId, j]));
  const rows = pairs.map((p) => {
    const j = judged.get(p.pairId);
    return {
      pairId: p.pairId,
      level: p.level,
      sharedAnswer: p.sharedAnswer,
      aId: Number(p.a.ref),
      bId: Number(p.b.ref),
      aQuestion: p.a.question,
      bQuestion: p.b.question,
      verdict: j?.verdict ?? 'unsure',
      reason: j?.reason ?? '★ 모델이 판정하지 않았다',
      keep: j?.keep && j.keep !== 'none' ? j.keep : '',
      keepReason: j?.keepReason ?? '',
      mergeAnswers: j?.mergeAnswers ?? [],
      confidence: j?.confidence ?? 0,
      applied: false,
    };
  });

  for (const row of rows) {
    console.log(`  ${row.pairId} ${row.verdict}(${row.confidence}) "${row.sharedAnswer}" — ${row.reason}`);
    if (row.verdict === 'same') console.log(`     남길 쪽: ${row.keep.toUpperCase()} — ${row.keepReason}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. 반영 (--apply 를 준 경우만)
  //   ★ 지우지 않는다. is_active 만 내린다
  // ─────────────────────────────────────────────────────────────────────────
  if (APPLY) {
    let off = 0;
    let merged = 0;
    for (const row of rows) {
      if (row.verdict !== 'same' || !row.keep) continue;
      const dropId = row.keep === 'a' ? row.bId : row.aId;
      const keepId = row.keep === 'a' ? row.aId : row.bId;

      await client.query('BEGIN');
      try {
        // ★ status 를 건드리지 않는다. is_active 만 내린다
        await client.query('UPDATE questions SET is_active = false, updated_at = now() WHERE id = $1', [
          dropId,
        ]);
        // ★ 이력을 남긴다. 왜 내렸는지 알 수 있어야 한다
        await client.query(
          `UPDATE review_queue
              SET reviewer_note = coalesce(reviewer_note || ' / ', '')
                  || $2
            WHERE question_id = $1`,
          [dropId, `★ R012 중복 정리: #${keepId} 과 같은 문제로 판정되어 is_active 를 내렸다. ${row.reason}`],
        );

        // ★ 부수 이득 — 버리는 쪽의 표기를 남기는 쪽에 합친다
        for (const a of row.mergeAnswers ?? []) {
          const norm = normalizeAnswer(a);
          if (!norm) continue;
          await client.query(
            `INSERT INTO question_answers (question_id, answer_text, answer_norm, is_primary)
             VALUES ($1, $2, $3, false) ON CONFLICT DO NOTHING`,
            [keepId, a, norm],
          );
          merged += 1;
        }
        await client.query('COMMIT');
        row.applied = true;
        off += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[db] ★ #${dropId} 처리 실패: ${err.message}`);
      }
    }
    console.log(`\n[db] ★ is_active 를 내린 문제 ${off}건 / 합친 표기 ${merged}개`);
    console.log('[db] ★ 지우지 않았다. status 도 건드리지 않았다 — 검수 이력을 보존한다.');
  } else {
    console.log('\n[db] ★ --apply 를 주지 않았으므로 DB 를 바꾸지 않았다.');
  }

  const outDir = path.join(ROOT, 'data/pipeline/dedupe');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().slice(0, 10)}-db-dedupe.json`);
  await writeFile(
    outFile,
    JSON.stringify(
      {
        _meta: {
          judgedAt: new Date().toISOString(),
          judgeModel: r.model,
          questions: qs.length,
          totalPairsIfBruteForce: report.totalPairsIfBruteForce,
          candidatePairs: report.candidatePairs,
          applied: APPLY,
        },
        pairs: rows,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`[db] 저장: ${path.relative(ROOT, outFile)}`);
} finally {
  await client.end();
}
