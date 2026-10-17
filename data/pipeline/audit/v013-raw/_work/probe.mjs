import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const r = (await c.query("select difficulty_score d, count(*) n from questions where is_active group by 1 order by 1")).rows; console.log(JSON.stringify(r));
const s = (await c.query("select regexp_replace(coalesce(source_ref,''), '[0-9a-fA-F-]{6,}|#.*$|[0-9]+$', '') k, count(*) n from questions where is_active and difficulty_score=3 group by 1 order by 2 desc limit 25")).rows; console.log(JSON.stringify(s));
const e = (await c.query("select source_ref, general_hint is null nohint from questions where is_active and difficulty_score=3 limit 5")).rows; console.log(JSON.stringify(e));
const t = (await c.query("select count(*) filter (where general_hint is null) nh, count(*) n from questions where is_active and difficulty_score=3")).rows; console.log(JSON.stringify(t));
await c.end();
