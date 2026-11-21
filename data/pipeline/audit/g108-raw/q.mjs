// 읽기 전용 질의 도우미 (G108) — DB=quizweb_dev 로 dev
import pg from 'pg';
process.loadEnvFile(new URL('../../../../.env', import.meta.url));
const url = new URL(process.env.DATABASE_URL); if (process.env.DB) url.pathname = '/' + process.env.DB;
const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
const r = await c.query(process.argv[2]); console.log(JSON.stringify(r.rows, null, 1).slice(0, Number(process.env.MAX || 6000))); await c.end();
