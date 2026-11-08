import pg from 'pg';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const q=async(s,p)=>(await db.query(s,p)).rows;
console.log('games total',JSON.stringify(await q(`select count(*)::int n, min(started_at) mn, max(started_at) mx, count(*) filter (where started_at>'2026-11-05T00:48:13Z')::int after0028, count(*) filter (where started_at>'2026-11-06T08:39:00Z')::int after_last_gq from games`)));
console.log('per game',JSON.stringify(await q(`select g.id::text, g.mode, g.setting_question_count qc, g.planned_question_count pl, g.ended_question_count ed, count(*)::int rows, count(distinct q.category_id)::int cats, count(*) filter (where gq.worth=3)::int w3, count(*) filter (where gq.worth=2)::int w2, string_agg(distinct gq.target_grade::text,',') tg, g.started_at::date d from game_questions gq join games g on g.id=gq.game_id join questions q on q.id=gq.question_id where gq.target_grade is not null group by g.id order by g.started_at`)));
console.log('tier by sc',JSON.stringify(await q(`select g.setting_question_count qc, count(*)::int n from game_questions gq join games g on g.id=gq.game_id where gq.target_grade is not null group by 1 order by 1`)));
await db.end();
