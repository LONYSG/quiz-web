#!/usr/bin/env node
// =============================================================================
// 승인된 문제를 DB에 적재한다 (작업 F-2)
//
// ★ 컴파일 산출물을 실행한다 (D-020). pipeline/dist 와 shared/dist 에서 import 한다.
//
// ★★ 자동으로 서비스 DB에 투입하지 않는다.
//   `approved/` 에 있고 review.status === 'approved' 인 것만 적재한다.
//   ★ 이상한 문제 하나가 실전에 나오면 그 판이 망가진다. 사람의 승인이 반드시 필요하다.
//
// ★ 적재해도 곧바로 출제되지 않는다.
//   questions.status 를 'pending_review' 로 넣고 is_active=false 로 둔다.
//   ★ 게임의 출제 조건은 status='approved' AND is_active 다.
//     즉 DB에 들어가는 것과 출제되는 것이 분리되어 있다.
//     --approve 를 주면 승인 상태로 넣는다(검수를 이미 사람이 했으므로 기본값으로 한다).
//
// ★ 중복 적재 방지 (세 겹, pipeline/README.md 4장)
//   1. 적재 전 DB 조회로 이미 있는 source_ref 를 건너뛴다
//   2. questions 의 부분 UNIQUE (source_id, source_ref)
//   3. question_answers 의 answer_norm UNIQUE
//   ★ 두 번 돌려도 안전해야 한다.
//
// 사용법
//   npm run pipeline:load                      approved/ 전체를 적재
//   npm run pipeline:load -- --dry-run         무엇이 적재될지만 보여준다
//   npm run pipeline:load -- --pending         승인 대기 상태로 넣는다 (기본은 승인)
// =============================================================================

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer, NORMALIZE_VERSION } from '../shared/dist/index.js';
import { dedupeAnswers } from '../pipeline/dist/rules.js';
import { DATA_DIRS } from '../pipeline/dist/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const AS_PENDING = args.includes('--pending');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

// ── 1. approved/ 읽기
const approvedRoot = path.join(ROOT, DATA_DIRS.approved);
const files = [];
async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (e.name.endsWith('.json')) files.push(full);
  }
}
await walk(approvedRoot);

if (files.length === 0) {
  console.log(`[load] ${path.relative(ROOT, approvedRoot)} 에 승인 파일이 없다.`);
  console.log('[load]   검수 절차는 docs/11-DEPLOY.md 를 본다.');
  process.exit(0);
}

const items = [];
for (const f of files) {
  const batch = JSON.parse(await readFile(f, 'utf8'));
  for (const item of batch.items ?? []) {
    // ★ approved/ 에 있어도 review.status 를 다시 확인한다.
    //   파일만 옮기고 상태를 바꾸지 않은 경우를 막는다.
    if (item.review?.status !== 'approved') continue;
    if (item.verdict !== 'accept') continue;
    if (!item.generated) continue;
    items.push({ ...item, _file: path.relative(ROOT, f) });
  }
}
console.log(`[load] 승인 파일 ${files.length}개 / 승인된 문제 ${items.length}건`);
if (items.length === 0) {
  console.log('[load] ★ review.status 가 "approved" 인 항목이 없다.');
  console.log('[load]   검수에서 상태를 바꿨는지 확인한다.');
  process.exit(0);
}

// ── 2. 카테고리 매핑
//   ★ DB의 categories.key 는 영문 키다. 가공 결과는 한국어 이름으로 온다.
const CATEGORY_MAP = {
  일반상식: 'general',
  역사: 'history',
  지리: 'geography',
  과학: 'science',
  수학: 'math',
  자연: 'nature',
  예술: 'art',
  음악: 'music',
  영화: 'movie',
  문학: 'literature',
  스포츠: 'sports',
  인물: 'people',
  기술: 'tech',
  신화: 'myth',
  언어: 'language',
  기타: 'etc',
};

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // 카테고리 id 조회
  const catRows = await client.query('SELECT id, key FROM categories');
  const catByKey = new Map(catRows.rows.map((r) => [r.key, r.id]));
  const fallbackId = catByKey.get('general') ?? catRows.rows[0]?.id;
  if (!fallbackId) throw new Error('categories 테이블이 비어 있다. 먼저 마이그레이션을 적용한다.');

  // ── 3. 이미 있는 source_ref 조회
  const refs = items.map((i) => i.sourceRef);
  const existing = await client.query(
    `SELECT source_ref FROM questions WHERE source_id = $1 AND source_ref = ANY($2::text[])`,
    [items[0].sourceId, refs],
  );
  const known = new Set(existing.rows.map((r) => r.source_ref));
  const todo = items.filter((i) => !known.has(i.sourceRef));
  console.log(`[load] 이미 적재됨 ${known.size}건 / 새로 적재할 것 ${todo.length}건`);

  if (DRY) {
    console.log('\n[dry-run] 적재 예정 목록');
    for (const i of todo) {
      console.log(`  ${i.sourceRef}  ${i.generated.questionKo}`);
      console.log(`     정답: ${i.generated.displayAnswer}  변형 ${i.generated.answers.length}개`);
      console.log(`     카테고리: ${i.generated.category} / 난이도: ${i.generated.difficulty}`);
    }
    process.exit(0);
  }

  if (todo.length === 0) {
    console.log('[load] 적재할 새 문제가 없다. (두 번 돌려도 안전하다)');
    process.exit(0);
  }

  // ── 4. 적재
  const status = AS_PENDING ? 'pending_review' : 'approved';
  const isActive = !AS_PENDING;
  let inserted = 0;
  let answerRows = 0;
  const skipped = [];

  for (const item of todo) {
    const g = item.generated;
    const categoryId = catByKey.get(CATEGORY_MAP[g.category] ?? '') ?? fallbackId;
    // ★ 정규화해서 같아지는 표기를 합친다. DB의 answer_norm UNIQUE 를 만족시켜야 한다.
    const answers = dedupeAnswers([g.displayAnswer, ...g.answers]);
    if (answers.length === 0) {
      skipped.push({ ref: item.sourceRef, reason: 'no_answers' });
      continue;
    }

    // ★ 문제 하나와 그 정답들을 한 트랜잭션으로 넣는다.
    //   정답 없는 문제가 남으면 게임에서 아무도 맞힐 수 없다.
    await client.query('BEGIN');
    try {
      const res = await client.query(
        `INSERT INTO questions
           (question_text, display_answer, hint_answer, answer_lang, category_id,
            difficulty, explanation, source_id, source_ref, license, status, is_active,
            approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $11 = 'approved' THEN now() ELSE NULL END)
         RETURNING id`,
        [
          g.questionKo,
          g.displayAnswer,
          g.hintAnswer,
          g.answerLang || 'ko',
          categoryId,
          g.difficulty || 'medium',
          g.explanation || null,
          item.sourceId,
          item.sourceRef,
          'CC-BY-SA-4.0',
          status,
          isActive,
        ],
      );
      const questionId = res.rows[0].id;

      for (const a of answers) {
        // ★ answer_norm 은 shared 의 normalizeAnswer 로 계산한다.
        //   ★ 런타임 판정과 같은 함수여야 한다. 다르면 정답이 조용히 오답 처리된다.
        await client.query(
          `INSERT INTO question_answers (question_id, answer_text, answer_norm, is_primary)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [questionId, a, normalizeAnswer(a), a === g.displayAnswer],
        );
        answerRows += 1;
      }

      // ★ 검수 이력을 review_queue 에 남긴다.
      await client.query(
        `INSERT INTO review_queue
           (question_id, ai_model, ai_confidence, ai_flags, backcheck_answer,
            backcheck_result, rule_flags, reviewer_note, reviewed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
         ON CONFLICT (question_id) DO NOTHING`,
        [
          questionId,
          // ★ 실제로 쓴 모델을 넣는다. 체인 때문에 항목마다 다를 수 있다.
          item.meta?.processModel ?? null,
          item.ai?.confidence ?? null,
          JSON.stringify(item.ai ?? {}),
          item.backcheck?.answer ?? null,
          item.backcheck?.result ?? 'skipped',
          JSON.stringify(item.rules ?? {}),
          item.review?.note ?? null,
        ],
      );

      await client.query('COMMIT');
      inserted += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      skipped.push({ ref: item.sourceRef, reason: err.message.slice(0, 120) });
    }
  }

  console.log('');
  console.log(`[load] 적재 완료: 문제 ${inserted}건 / 정답 표기 ${answerRows}행`);
  console.log(`[load] status=${status} / is_active=${isActive}`);
  console.log(`[load] normalizeAnswer 버전 ${NORMALIZE_VERSION}`);
  if (skipped.length) {
    console.log(`[load] ★ 건너뛴 것 ${skipped.length}건`);
    for (const s of skipped) console.log(`  ${s.ref}: ${s.reason}`);
  }

  const total = await client.query(
    `SELECT count(*)::int AS n FROM questions WHERE status='approved' AND is_active`,
  );
  console.log(`[load] 현재 출제 가능 문제 수: ${total.rows[0].n}건`);
} finally {
  await client.end();
}
