#!/usr/bin/env node
// =============================================================================
// ★★ R090 (D-347 · 0035) — 객관식 5연속 저장 보기 적재: data/minigame/choice/options.json → question_choices
//
//   node scripts/choice-load.mjs            ← 미리 보기(쓰지 않음)
//   node scripts/choice-load.mjs --apply    ← 적재(한 트랜잭션 · 멱등 — 파일에 있는 문항은 덮어씀 · 파일에서 빠진 문항은 지움)
//   DATABASE_URL 기본 = 실 quizweb(메뉴 1 이 부른다)
//
// ★ 정본 꼴(GEN 이 채운다 — 이 스크립트는 만들지 않는다):
//   { "game": "choice", "version": 1, "items": [ { "qid": 1970, "options": ["오답1", "오답2", "오답3"], "status": "verified" } ] }
// ★ verified 만 · qid 없는 문항 · 비활성 문항 · 보기 3 미만 · 빈 보기는 건너뛰고 수를 보고
// ★ 파일이 없거나 items 0 이어도 정상 끝(exit 0 · "객관식 보기 0")
// ★ 끝 줄: "객관식 보기 n (건너뜀 m — 없는 문항 a · 비활성 b · 꼴 c · verified 아님 d)"
// =============================================================================
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHOICE_FILE = path.join(ROOT, 'data', 'minigame', 'choice', 'options.json');

/** 파일 → 넣을 행 · 건너뜀(DB 를 보지 않는 꼴 검사) */
export function readChoices(file = CHOICE_FILE) {
  if (!existsSync(file)) return { rows: [], skip: { shape: 0, status: 0 }, missingFile: true };
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const items = Array.isArray(j?.items) ? j.items : [];
  const rows = [];
  const skip = { shape: 0, status: 0 };
  const seen = new Set();
  for (const it of items) {
    if (it?.status !== 'verified') {
      skip.status += 1;
      continue;
    }
    const opts = Array.isArray(it.options) ? it.options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim()) : [];
    if (!Number.isInteger(it.qid) || opts.length < 3 || new Set(opts).size !== opts.length || seen.has(it.qid)) {
      skip.shape += 1;
      continue;
    }
    seen.add(it.qid);
    rows.push({ qid: it.qid, options: opts, round: typeof it.round === 'string' ? it.round : (typeof j.round === 'string' ? j.round : null) });
  }
  return { rows, skip, missingFile: false };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
  const { rows, skip, missingFile } = readChoices();
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const has = ((await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'question_choices'`)).rowCount ?? 0) > 0;
    if (!has) {
      console.log('객관식 보기 0 (question_choices 없음 — 0035 전)');
      return;
    }
    const ids = rows.map((r) => r.qid);
    const qs = ids.length ? (await db.query(`SELECT id::int id, is_active a FROM questions WHERE id = ANY($1::bigint[])`, [ids])).rows : [];
    const state = new Map(qs.map((q) => [q.id, q.a]));
    const put = rows.filter((r) => state.get(r.qid) === true);
    const none = rows.filter((r) => !state.has(r.qid)).length;
    const inactive = rows.filter((r) => state.get(r.qid) === false).length;
    if (apply) {
      await db.query('BEGIN');
      try {
        await db.query(`DELETE FROM question_choices WHERE NOT (question_id = ANY($1::bigint[]))`, [put.map((r) => r.qid)]);
        if (put.length)
          await db.query(
            `INSERT INTO question_choices (question_id, options, round, loaded_at)
             SELECT x.qid, x.options, x.round, now() FROM jsonb_to_recordset($1::jsonb) AS x(qid bigint, options jsonb, round text)
             ON CONFLICT (question_id) DO UPDATE SET options = EXCLUDED.options, round = EXCLUDED.round, loaded_at = now()`,
            [JSON.stringify(put)],
          );
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
    }
    const total = (await db.query(`SELECT count(*)::int n FROM question_choices`)).rows[0].n;
    console.log(`${apply ? '' : '(미리 보기) '}객관식 보기 ${apply ? total : put.length} (건너뜀 ${none + inactive + skip.shape + skip.status} — 없는 문항 ${none} · 비활성 ${inactive} · 꼴 ${skip.shape} · verified 아님 ${skip.status}${missingFile ? ' · 파일 없음' : ''})`);
  } finally {
    await db.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[choice-load] 실패: ${err.message}`);
    process.exit(1);
  });
}
