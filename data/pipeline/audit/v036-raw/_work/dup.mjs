import fs from 'node:fs';import pg from 'pg';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const o=JSON.parse(fs.readFileSync('data/pipeline/audit/v036-raw/merged-raw.json','utf8'));
const act=(await db.query(`select q.id::text,q.display_answer,q.question_text,q.general_hint,coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id),'{}') ans from questions q where q.is_active`)).rows;
const norm=s=>s.replace(/[\s·\-_.,'’"()]/g,'').toLowerCase();
const am=new Map();for(const a of act)for(const t of new Set([a.display_answer,...a.ans])){const k=norm(t);if(!am.has(k))am.set(k,[]);am.get(k).push(a)}
const res=[];
for(const x of o){const t=JSON.parse(fs.readFileSync('data/pipeline/audit/v036-raw/targets-g032-484.json','utf8')).items.find(i=>i.id===x.id);
 const same=am.get(norm(x.answer))||[];
 // hint/question of this item contains other active answers (len>=3)
 const hint=t.hint||'';const cross=[];
 for(const [k,arr] of am){ if(k.length>=3 && norm(hint).includes(k) && k!==norm(x.answer) && !norm(t.answer).includes(k)) cross.push(arr[0].display_answer)}
 // active question text contains the new answer (leak the other way)
 const rev=act.filter(a=>norm(a.question_text+a.general_hint).includes(norm(x.answer))&&norm(x.answer).length>=3&&a.id!==x.id).map(a=>a.id+':'+a.display_answer);
 res.push({id:x.id,answer:x.answer,sameAns:same.map(a=>a.id+':'+a.question_text.slice(0,60)),hintCross:[...new Set(cross)].slice(0,8),revLeak:rev.slice(0,6)});}
fs.writeFileSync('data/pipeline/audit/v036-raw/dupcheck.json',JSON.stringify(res,null,1));
console.log('sameAns',res.filter(r=>r.sameAns.length).length,'hintCross',res.filter(r=>r.hintCross.length).length,'revLeak',res.filter(r=>r.revLeak.length).length);
for(const r of res.filter(r=>r.sameAns.length))console.log('SAME',r.id,r.answer,r.sameAns.join(' || '));
await db.end();
