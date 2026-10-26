import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const r=(await c.query(`select id::int, difficulty_score d, is_active a from questions`)).rows;await c.end();
const m={};for(const x of r)if(x.a)m[x.id]=x.d;fs.writeFileSync('dif.now.json',JSON.stringify(m));
const cnt={};for(const v of Object.values(m))cnt[v]=(cnt[v]||0)+1;console.log(Object.keys(m).length,cnt);
