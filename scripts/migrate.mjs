#!/usr/bin/env node
// =============================================================================
// 마이그레이션 러너
//
// Q-49 확정: ORM을 쓰지 않는다. 순수 SQL 파일 + 작은 러너 + pg 드라이버 직접.
// 근거는 docs/07-DECISIONS.md 참조. 요약하면 "스키마와 쿼리가 그 자리에 SQL로
// 그대로 보이는 것"이 다른 AI·다른 개발자의 인수인계(guide 61절)에 가장 유리하다.
//
// 사용법
//   npm run db:migrate           적용되지 않은 마이그레이션을 순서대로 적용
//   npm run db:migrate -- --dry  적용 대상만 출력하고 실행하지 않음
//   npm run db:reset             ★ 모든 테이블을 삭제하고 처음부터 다시 적용 (개발용)
// =============================================================================

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, '..', 'migrations');

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const DRY = process.argv.includes('--dry');
const RESET = process.argv.includes('--reset');

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    if (RESET) {
      console.log('[migrate] --reset: public 스키마를 재생성합니다 (모든 데이터 삭제)');
      await client.query('DROP SCHEMA public CASCADE');
      await client.query('CREATE SCHEMA public');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text        PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort(); // 0001_, 0002_ ... 파일명 순서가 곧 적용 순서다

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log(`[migrate] 적용할 마이그레이션이 없습니다. (총 ${files.length}개 모두 적용됨)`);
      return;
    }

    console.log(`[migrate] 적용 대상 ${pending.length}개: ${pending.join(', ')}`);
    if (DRY) {
      console.log('[migrate] --dry 이므로 실행하지 않습니다.');
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      // 마이그레이션 하나를 한 트랜잭션으로 적용한다. 중간에 실패하면 전부 롤백된다.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] OK  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAIL ${file}`);
        throw err;
      }
    }

    console.log('[migrate] 완료');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrate] 오류:', err.message);
  process.exit(1);
});
