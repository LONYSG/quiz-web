import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const r = (await c.query(`select source_id, source_ref, score_version, to_char(scored_at,'YYYY-MM-DD') sd, to_char(created_at,'YYYY-MM-DD') cd from questions where is_active and difficulty_score>=4 and source_ref not like '%#g003-%' order by random() limit 40`)).rows;
for (const x of r) console.log(x.source_id, x.source_ref, x.score_version, x.sd, x.cd);
const g = (await c.query(`select score_version, to_char(created_at,'YYYY-MM') m, count(*)::int n from questions where is_active and difficulty_score>=4 and source_ref not like '%#g003-%' group by 1,2 order by 2,1`)).rows; console.log(JSON.stringify(g));
await c.end();
