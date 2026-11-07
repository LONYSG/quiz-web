import fs from 'node:fs';import pg from 'pg';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const s=JSON.parse(fs.readFileSync('data/pipeline/audit/v035-g032.json','utf8'));
const ids=(s.items||s).map(x=>String(x.id));console.log('163?',ids.length);
const r=await db.query(`select status,is_active,count(*) from questions where source_ref ~ 'g032' group by 1,2`);console.log(r.rows);
const r2=await db.query(`select count(*) from questions where status='pending_review' and is_active=false and id<>all($1::bigint[])`,[ids]);console.log('pending not in163',r2.rows);
const r3=await db.query(`select source_ref from questions where status='pending_review' and is_active=false limit 3`);console.log(r3.rows);
const r4=await db.query(`select count(*) from questions where status='pending_review' and is_active=false and id=any($1::bigint[])`,[ids]);console.log('163 still pending',r4.rows);
await db.end();
