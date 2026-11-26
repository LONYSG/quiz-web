// G113 보고 표 — 55장 + n4401: key · 정답 · 전 → 후 (실 DB 기준)
import pg from 'pg'; import { readFileSync } from 'node:fs';
import { KEYS55 } from './rows.mjs';
process.loadEnvFile?.(new URL('../../../../.env', import.meta.url));
const B = JSON.parse(readFileSync(new URL('./category-before.json', import.meta.url), 'utf8')).quizweb.questions;
const u = new URL(process.env.DATABASE_URL); u.pathname = '/quizweb';
const c = new pg.Client({ connectionString: u.toString() }); await c.connect();
const name = async (id) => (await c.query(`select m.name_ko||' > '||l.name_ko n from categories l join categories m on m.id=l.parent_id where l.id=$1`, [id])).rows[0].n;
const Q = (await c.query(`select id::int, display_answer a, category_id::int cid, coalesce(split_part(source_ref,'#g112-',2), '') k1, split_part(source_ref,'#g113-',2) k2 from questions where source_ref like '%#g112-%' or source_ref like '%#g113-%'`)).rows;
const by = new Map(Q.map((q) => [q.k1 || q.k2, q]));
for (const k of [...KEYS55, 'n4401']) { const q = by.get(k); const was = B[q.id];
  console.log(`| ${k} | ${q.a} | ${was ? `${await name(was)} → ${await name(q.cid)}` : `${await name(q.cid)} · 그대로`} |`); }
await c.end();
