import pg from 'pg';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const c=await db.query(`select column_name from information_schema.columns where table_name='questions' order by ordinal_position`);console.log(c.rows.map(r=>r.column_name).join(','));
const n=await db.query(`select count(*) from questions where status='pending_review' and is_active=false`);console.log(n.rows[0]);
const r=await db.query(`select * from questions where status='pending_review' limit 1`);console.log(JSON.stringify(r.rows[0]).slice(0,1500));
const a=await db.query(`select * from question_answers where question_id=$1`,[r.rows[0].id]);console.log(JSON.stringify(a.rows));
await db.end();
