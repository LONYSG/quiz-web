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

// ★ R070 (D-312) — 잠금은 10초만 기다린다. 전에는 lock_timeout 0(무한)이라 GEN 라운드가 표를 쓰는 트랜잭션을 연 채면
//   메뉴 1 이 migrate 에서 끝없이 멈췄다. 한 파일 = 한 트랜잭션은 그대로라 실패하면 적용된 것이 없다.
const LOCK_TIMEOUT = '10s';
const STATEMENT_TIMEOUT = '120s';

/** 잠금을 못 얻었을 때 — 지금 트랜잭션을 연 다른 세션을 찍는다(읽기만) */
async function explainLock(client) {
  console.error('');
  console.error(`[migrate] ★ 다른 세션(GEN 라운드일 가능성)이 표를 쓰는 중이라 ${LOCK_TIMEOUT.replace('s', '초')} 안에 잠금을 못 얻었다 — 적용된 것 없음.`);
  console.error("[migrate]   GEN 이 단계를 커밋한 뒤(터미널 '… 커밋' 줄) 다시 1 을 누르세요.");
  try {
    const r = await client.query(
      `SELECT pid, coalesce(nullif(application_name, ''), '(이름 없음)') AS app, state,
              extract(epoch FROM now() - xact_start)::int AS age,
              left(regexp_replace(query, '\\s+', ' ', 'g'), 60) AS q
         FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL
        ORDER BY xact_start LIMIT 3`,
    );
    for (const x of r.rows) console.error(`[migrate]   잠근 쪽 후보: pid ${x.pid} · ${x.app} · ${x.state} · 트랜잭션 ${x.age}초 · "${x.q}"`);
    if (r.rows.length === 0) console.error('[migrate]   (지금은 열린 트랜잭션이 없다 — 방금 끝났을 수 있다 · 다시 1)');
  } catch { /* 설명은 덤 */ }
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
  await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT}'`);

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
  } catch (err) {
    if (err.code === '55P03') { await explainLock(client); err.message = `잠금 대기 ${LOCK_TIMEOUT} 초과 (${err.message})`; }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrate] 오류:', err.message);
  process.exit(1);
});
