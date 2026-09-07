#!/usr/bin/env node
// =============================================================================
// 시드 데이터 투입
//
// data/seed/questions.manual.json 을 읽어 questions / question_answers 에 넣는다.
//
// ★ answer_norm 은 shared 의 normalizeAnswer() 로 계산한다.
//   서버의 정답 판정과 반드시 같은 함수를 써야 한다. 다르면 DB에 저장된 정규화 값과
//   런타임 판정이 어긋나 정답이 조용히 오답 처리된다. (shared/src/normalize.ts 주석 참조)
//
// ★ 중복 적재 방지: source_ref 를 키로 ON CONFLICT 처리한다.
//   여러 번 실행해도 안전하다.
//
// 사용법
//   npm run db:seed
//   npm run db:seed -- --file data/seed/다른파일.json
// =============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/normalize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

const fileIdx = process.argv.indexOf('--file');
const seedFile =
  fileIdx >= 0 && process.argv[fileIdx + 1]
    ? path.resolve(process.argv[fileIdx + 1])
    : path.join(ROOT, 'data', 'seed', 'questions.manual.json');

const raw = JSON.parse(await readFile(seedFile, 'utf8'));
const meta = raw._meta ?? {};
const sourceId = meta.sourceId ?? 'manual';
const license = meta.license ?? 'CC-BY-SA-4.0';

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

let inserted = 0;
let skipped = 0;
let answerRows = 0;

try {
  const catRows = await client.query('SELECT id, key FROM categories');
  const catByKey = new Map(catRows.rows.map((r) => [r.key, r.id]));

  for (const [index, item] of raw.questions.entries()) {
    const sourceRef = `${sourceId}-seed-${String(index + 1).padStart(4, '0')}`;
    const categoryId = catByKey.get(item.cat);
    if (!categoryId) {
      console.warn(`[seed] 알 수 없는 카테고리 '${item.cat}' — 건너뜀: ${item.q}`);
      skipped += 1;
      continue;
    }

    await client.query('BEGIN');
    try {
      const q = await client.query(
        `INSERT INTO questions
           (question_text, display_answer, hint_answer, answer_lang, category_id,
            difficulty, explanation, source_id, source_ref, license,
            status, is_active, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',true,now())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          item.q,
          item.display,
          item.hint ?? null,
          item.lang ?? 'ko',
          categoryId,
          item.diff ?? 'medium',
          item.exp ?? null,
          sourceId,
          sourceRef,
          license,
        ],
      );

      if (q.rowCount === 0) {
        await client.query('ROLLBACK');
        skipped += 1;
        continue;
      }

      const questionId = q.rows[0].id;

      for (const answer of item.answers) {
        const norm = normalizeAnswer(answer);
        if (!norm) continue;
        const r = await client.query(
          `INSERT INTO question_answers (question_id, answer_text, answer_norm, is_primary)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (question_id, answer_norm) DO NOTHING`,
          [questionId, answer, norm, answer === item.display],
        );
        answerRows += r.rowCount ?? 0;
      }

      await client.query('COMMIT');
      inserted += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  // 중복 source_ref 재실행 시를 위한 안내
  const total = await client.query(
    `SELECT count(*)::int AS n FROM questions WHERE status='approved' AND is_active`,
  );

  console.log(`[seed] 새로 넣은 문제 ${inserted}개, 건너뜀 ${skipped}개, 정답 표기 ${answerRows}행`);
  console.log(`[seed] 현재 출제 가능 문제 수: ${total.rows[0].n}개`);
} finally {
  await client.end();
}
