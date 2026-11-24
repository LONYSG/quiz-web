// G110 끝 점검(읽기만) — node check.mjs [db]
import pg from 'pg';
import { readFileSync } from 'node:fs';
process.loadEnvFile(new URL('../../../../.env', import.meta.url));
const url = new URL(process.env.DATABASE_URL); if (process.argv[2]) url.pathname = '/' + process.argv[2];
const db = url.pathname.slice(1);
const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
const plan = JSON.parse(readFileSync(new URL(`../g110-plan-${db}.json`, import.meta.url), 'utf8'));
const src = JSON.parse(readFileSync(new URL('../g110-sources.json', import.meta.url), 'utf8'));
const rows = (await c.query(`select q.id::int, q.source_ref, q.is_active, q.status, q.display_answer, q.hint_answer, q.difficulty_score, q.general_hint, q.explanation,
   (select count(*)::int from question_answers a where a.question_id=q.id and a.is_primary) prim,
   (select answer_text from question_answers a where a.question_id=q.id and a.is_primary limit 1) prim_text,
   (select count(*)::int from question_answers a where a.question_id=q.id and not a.is_primary) vars,
   (select count(*)::int from review_queue r where r.question_id=q.id) rq
  from questions q where q.source_ref like '%#g110-%'`)).rows;
const keys = new Set(plan.load.map((x) => x.key)); const got = new Set(rows.map((r) => r.source_ref.split('#g110-')[1]));
const bad3 = rows.filter((r) => !(r.display_answer === r.hint_answer && r.prim === 1 && r.prim_text === r.display_answer));
const noSrc = rows.filter((r) => !(src.items[r.source_ref.split('#g110-')[1]]?.ids?.[db] === r.id && src.items[r.source_ref.split('#g110-')[1]].urls.length));
const planVars = plan.load.reduce((s, x) => s + x.variants.length, 0);
console.log(JSON.stringify({ db, rows: rows.length, plan: plan.load.length, missing: [...keys].filter((k) => !got.has(k)), extra: [...got].filter((k) => !keys.has(k)),
  active: rows.filter((r) => r.is_active && r.status === 'approved').length, threePlacesBad: bad3.length, variants: rows.reduce((s, r) => s + r.vars, 0), planVariants: planVars,
  noSource: noSrc.length, noReview: rows.filter((r) => r.rq !== 1).length, noHint: rows.filter((r) => !r.general_hint).length, noExpl: rows.filter((r) => !r.explanation).length,
  gradeMismatch: rows.filter((r) => r.difficulty_score !== plan.load.find((x) => x.key === r.source_ref.split('#g110-')[1]).grade).length }));
await c.end();
