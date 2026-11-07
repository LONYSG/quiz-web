import pg from 'pg';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const ids=[22,516,1524,1491,3451,2055,2688,667,820,1557,1333,1700,1923,2381,2369,2586,2957,3063,3084,3239,4992,1460];
const r=(await db.query(`select q.id,q.question_text,q.display_answer,(select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary) v from questions q where id=any($1) order by q.id`,[ids])).rows;
for(const x of r)console.log(`#${x.id} [${x.display_answer}] var=${JSON.stringify(x.v)}\n  Q: ${x.question_text}`);
await db.end();
