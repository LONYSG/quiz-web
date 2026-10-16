import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const r = (await c.query(`select level, count(*)::int n, array_agg(distinct game_topic) gt from categories group by level order by level`)).rows; console.log(JSON.stringify(r));
const s = (await c.query(`select c.key, c.name_ko, c.level, p.key pkey, p.name_ko pname, c.game_topic from categories c left join categories p on p.id=c.parent_id where c.id in (select category_id from questions where is_active and difficulty_score>=4) order by c.key limit 12`)).rows; console.log(JSON.stringify(s));
const t = (await c.query(`select c.game_topic gt, count(*)::int n from questions q join categories c on c.id=q.category_id where q.is_active and q.difficulty_score>=4 and q.source_ref not like '%#g003-%' group by 1 order by 2 desc`)).rows; console.log(JSON.stringify(t));
const k = (await c.query(`select count(distinct q.category_id)::int n from questions q where q.is_active and q.difficulty_score>=4 and q.source_ref not like '%#g003-%'`)).rows[0]; console.log(k);
await c.end();
