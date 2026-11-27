import pg from 'pg';
process.loadEnvFile?.(new URL('../../../../.env', import.meta.url));
const u=new URL(process.env.DATABASE_URL); u.pathname='/'+(process.argv[2]||'quizweb');
const c=new pg.Client({connectionString:u.toString()}); await c.connect();
const r=await c.query(process.argv[3]); console.table(r.rows); await c.end();
