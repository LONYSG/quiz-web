import pg from 'pg';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
for(const x of (await db.query(`select id,display_answer,question_text,general_hint from questions where is_active and (id in (2194,2189,2273,2593,2196) or display_answer='증명') order by id`)).rows)console.log(`#${x.id} [${x.display_answer}]\nQ: ${x.question_text}\nH: ${x.general_hint}\n`);
await db.end();
