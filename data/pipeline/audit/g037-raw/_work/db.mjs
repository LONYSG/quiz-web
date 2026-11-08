// G037 작업용 — DB 읽기 도우미(쓰기 없음)
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
export const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
export const rj = (f) => JSON.parse(readFileSync(AUD(f), 'utf8'));
export const wj = (f, o) => writeFileSync(AUD(f), JSON.stringify(o, null, 1) + '\n');
export async function withDb(fn) { const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); try { return await fn(c); } finally { await c.end(); } }
export const ROWSQL = `select q.id::text id, q.question_text, q.display_answer, q.general_hint, q.general_hint_version, q.explanation, q.is_active, q.status, q.difficulty_score, q.worth,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q where q.id = any($1::bigint[])`;
