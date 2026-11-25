// 활성 문항 등급 × 대분류 표(읽기만) — node grade-major.mjs [db]
import pg from 'pg';
process.loadEnvFile(new URL('../../../../.env', import.meta.url));
const url = new URL(process.env.DATABASE_URL); if (process.argv[2]) url.pathname = '/' + process.argv[2];
const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
const r = (await c.query(`select m.name_ko major, q.difficulty_score g, count(*)::int n from questions q
  join categories l on l.id=q.category_id join categories md on md.id=l.parent_id join categories m on m.id=md.parent_id
  where q.is_active group by 1,2`)).rows;
const majors = [...new Set(r.map((x) => x.major))].sort();
const cell = (m, g) => r.filter((x) => (!m || x.major === m) && (!g || x.g === g)).reduce((s, x) => s + x.n, 0);
const f = (n) => n.toLocaleString('en-US');
console.log(`${url.pathname.slice(1)} 활성 ${f(cell())} (+ 분류가 대분류 아래가 아닌 것 ${(await c.query('select count(*)::int n from questions q join categories l on l.id=q.category_id where q.is_active and l.level<>3')).rows[0].n})`);
console.log('| 대분류 | 1 | 2 | 3 | 4 | 5 | 계 |\n|---|---|---|---|---|---|---|');
for (const m of majors) console.log(`| ${m} | ${[1, 2, 3, 4, 5].map((g) => f(cell(m, g))).join(' | ')} | ${f(cell(m))} |`);
console.log(`| 계 | ${[1, 2, 3, 4, 5].map((g) => f(cell(null, g))).join(' | ')} | ${f(cell())} |`);
await c.end();
