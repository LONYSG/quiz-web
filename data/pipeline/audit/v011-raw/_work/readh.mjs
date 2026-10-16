import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const r=(await c.query("select id,display_answer,general_hint from questions where id in (4268,641,2106,99)")).rows;
console.log(JSON.stringify(r,null,1)); await c.end();
