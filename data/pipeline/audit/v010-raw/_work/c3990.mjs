import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const g = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/g006-fixes.json', 'utf8'));
for (const id of [3990, 3898]) { const r = g.rows.find((x) => x.id === id); console.log(id, 'before:', r.before, '\n   after:', r.after, '\n   why:', r.why); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
for (const id of [2012, 3990, 1957, 3898]) { const q = (await c.query('select id, question_text, general_hint, explanation from questions where id=$1', [id])).rows[0]; console.log(id, q?.general_hint, '\n   Q:', q?.question_text?.slice(0, 80), '\n   E:', q?.explanation?.slice(0, 120)); }
await c.end();
