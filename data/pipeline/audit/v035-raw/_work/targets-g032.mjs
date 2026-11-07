import fs from 'node:fs';import pg from 'pg';
const P='data/pipeline/';const D=P+'audit/v035-raw/';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const vt=JSON.parse(fs.readFileSync(P+'audit/g032-verify-targets.json','utf8'));
const pend=(await db.query(`select q.id::text,q.question_text,q.display_answer,q.explanation,q.general_hint,q.worth,q.difficulty_score,q.difficulty_why,q.worth_why,q.source_ref,c.id::text cat,(select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary) variants from questions q left join categories c on c.id=q.category_id where q.status='pending_review' and q.is_active=false`)).rows;
const byId=Object.fromEntries(pend.map(r=>[r.id,r]));
const have=new Set(vt.items.map(i=>String(i.id)));
const extraNames=['그렘린','아스파탐','인터페론','테트라포드','블레이드 러너','Keep Calm','모주','파워포인트','탄소나노튜브','오벨리스크','햄스트링','작심삼일','생신','양자역학','고해성사'];
const extraWhy={};
for(const n of extraNames){const m=pend.filter(r=>r.display_answer.toLowerCase().includes(n.toLowerCase())||(r.variants||[]).some(v=>v.toLowerCase().includes(n.toLowerCase())));console.log(n,'→',m.map(r=>r.id+':'+r.display_answer+(have.has(r.id)?'(in163)':'')).join(' | ')||'NONE');}
// special by id
for(const id of ['7044','7386'])console.log(id,byId[id]?.display_answer,have.has(id));
await db.end();
