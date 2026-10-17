#!/usr/bin/env node
// =============================================================================
// ★★ 업적 소급 (R054 · D-243)
//
//   node scripts/achievements-backfill.mjs            ← dry-run: 지금 기록으로 얻을 업적 — 키별 수 · 계정 수 (DB 를 쓰지 않는다)
//   npm run db:backup && node scripts/achievements-backfill.mjs --apply   ← 넣기(이미 있으면 그대로 — 멱등 · backfilled=true)
//   [--login lonysg]  한 계정의 업적 목록
//
// ★ 판정 SQL 은 서버와 같은 글(server/dist/db/achievementsSql.js — 먼저 npm run build). 기존 표만 읽는다.
// ★ 모든 계정(봇 · 검사 계정 포함) — 찬종 계정(lonysg)도. 표시만 — 포인트는 바뀌지 않는다.
// =============================================================================
import pg from 'pg';
import { ACHIEVEMENTS_SQL, AWARD_SQL } from '../server/dist/db/achievementsSql.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LOGIN = args.includes('--login') ? args[args.indexOf('--login') + 1] : null;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
try {
  const ids = (await db.query(`SELECT array_agg(id) a FROM accounts`)).rows[0].a ?? [];
  const r = await db.query(ACHIEVEMENTS_SQL, [ids]);
  const have = await db.query(`SELECT account_id::text, key FROM achievements`);
  const had = new Set(have.rows.map((x) => `${x.account_id}|${x.key}`));
  const byKey = new Map();
  for (const x of r.rows) {
    const k = byKey.get(x.key) ?? { all: 0, fresh: 0 };
    k.all += 1;
    if (!had.has(`${x.account_id}|${x.key}`)) k.fresh += 1;
    byKey.set(x.key, k);
  }
  console.log(`[backfill] ${APPLY ? '★ 넣기(--apply)' : 'dry-run'} — 계정 ${ids.length} · 판정 행 ${r.rows.length} · 이미 있음 ${had.size}`);
  console.log('키                     얻은 계정   새로');
  for (const [k, v] of [...byKey.entries()].sort()) console.log(`${k.padEnd(22)} ${String(v.all).padEnd(10)} ${v.fresh}`);
  if (LOGIN) {
    const acc = (await db.query(`SELECT id::text FROM accounts WHERE login_id = $1`, [LOGIN])).rows[0]?.id;
    const mine = r.rows.filter((x) => String(x.account_id) === acc).map((x) => `${x.key} (${new Date(x.earned_at).toISOString().slice(0, 10)})`);
    console.log(`[backfill] ${LOGIN}: ${mine.length}개 — ${mine.join(' · ')}`);
  }
  if (APPLY) {
    const ins = await db.query(AWARD_SQL, [ids, true]);
    const n = (await db.query(`SELECT count(*)::int n, count(DISTINCT account_id)::int a FROM achievements`)).rows[0];
    console.log(`[backfill] 넣음 ${ins.rowCount} · 표 전체 ${n.n}행 · 계정 ${n.a}`);
  }
} finally {
  await db.end();
}
