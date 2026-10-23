#!/usr/bin/env node
// =============================================================================
// ★★ 앱 제보 처리 표시 (R061 · D-255) — handled_at + note
//   npm run reports:handle -- --id 12[,13,14] --note "R062 반영" --yes      (--yes 없으면 할 일만 찍고 멈춘다)
//   npm run reports:handle -- --id 12 --undo --yes                          (처리 표시 지우기)
// =============================================================================
import pg from 'pg';
import { adminDb, die, short } from './points-admin-lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const ids = String(opt('--id', '')).split(',').filter(Boolean);
const note = opt('--note', null);
const undo = args.includes('--undo');
if (!ids.length || ids.some((x) => !/^\d{1,19}$/.test(x))) die('--id N (여러 개는 쉼표)');
if (!undo && !note) die('--note "R0xx 반영" 이 필요하다');
if (note && [...note].length > 200) die('메모는 200자까지');

const { url } = adminDb();
const db = new pg.Client({ connectionString: url });
await db.connect();
const rows = (await db.query(`SELECT id::text, kind, text, handled_at FROM app_reports WHERE id = ANY($1::bigint[]) ORDER BY id`, [ids])).rows;
const missing = ids.filter((x) => !rows.some((r) => r.id === x));
if (missing.length) {
  await db.end();
  die(`없는 제보: ${missing.join(', ')}`);
}
for (const r of rows) {
  console.log(`[handle] #${r.id} ${r.kind} — ${short(r.text.replace(/\n/g, ' '), 50)}${r.handled_at ? ' (이미 처리됨)' : ''} → ${undo ? '처리 지움' : `✔ ${note}`}`);
}
if (!args.includes('--yes')) {
  console.log('[handle] ★ 맞으면 --yes 를 붙여 다시(지금은 쓰지 않았다)');
  await db.end();
  process.exit(2);
}
if (undo) await db.query(`UPDATE app_reports SET handled_at = NULL, note = NULL WHERE id = ANY($1::bigint[])`, [ids]);
else await db.query(`UPDATE app_reports SET handled_at = now(), note = $2 WHERE id = ANY($1::bigint[])`, [ids, note]);
await db.end();
console.log(`[handle] ✔ ${rows.length}건`);
