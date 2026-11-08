import pg from 'pg';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const q=async s=>(await db.query(s)).rows;
console.log(await q(`select count(*) from questions where status='approved' and is_active`));
console.log(JSON.stringify(await q(`select worth,difficulty_score g,count(*)::int from questions where status='approved' and is_active group by 1,2 order by 1,2`)));
console.log(JSON.stringify(await q(`select column_name from information_schema.columns where table_name='game_questions'`)));
await db.end();
