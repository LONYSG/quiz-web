import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const cols=(await c.query(`select column_name from information_schema.columns where table_name='question_feedback'`)).rows.map(r=>r.column_name);
const rows=(await c.query(`select f.question_id::int qid, f.vote, f.reasons, f.comment from question_feedback f join accounts a on a.id=f.account_id where a.login_id !~ '^(bot|uic|r10_)'`)).rows;
await c.end();
fs.writeFileSync('fb.json',JSON.stringify(rows));console.log(cols.join(','),rows.length,new Set(rows.map(r=>r.qid)).size, [...new Set(rows.map(r=>r.vote))]);
