import fs from 'node:fs';
import pg from 'pg';
const D='data/pipeline/audit/v034-raw/';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
// crossans
const lines=fs.readFileSync(D+'crossans-list.txt','utf8').split('\n').filter(l=>l.includes('[crossans]'));
const items=lines.map(l=>{const m=l.match(/\[crossans\] #(\d+) (.*?) → #(\d+) (.*?) \| (.*)$/);return m?{id:m[1],answer:m[2],otherId:m[3],otherAnswer:m[4],hint:m[5]}:null}).filter(Boolean);
console.log('parsed',items.length);
// seeded shuffle seed 34
let s=34;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/2**32};
const idx=items.map((_,i)=>i);for(let i=idx.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
const sample=idx.slice(0,100).map(i=>items[i]);
const ids=[...new Set(sample.map(x=>x.id))];
const q=(await db.query(`select id::text,question_text,display_answer,explanation,general_hint,difficulty_score,difficulty from questions where id=any($1::bigint[])`,[ids])).rows;
const qm=Object.fromEntries(q.map(r=>[r.id,r]));
const oq=(await db.query(`select id::text,question_text,display_answer from questions where id=any($1::bigint[])`,[sample.map(x=>x.otherId)])).rows;
const om=Object.fromEntries(oq.map(r=>[r.id,r]));
sample.forEach(x=>{x.question=qm[x.id].question_text;x.explanation=qm[x.id].explanation;x.grade=qm[x.id].difficulty_score;x.otherQuestion=om[x.otherId]?.question_text});
fs.writeFileSync(D+'targets-crossans-100.json',JSON.stringify({seed:34,total:items.length,frozenAt:new Date().toISOString(),items:sample},null,1));
console.log('dups in sample ids',100-ids.length);
// fb 38
const fb=fs.readFileSync('tmp/feedback-report.md','utf8');
const sec=fb.split('## 👎 많은 문제 38')[1].split('## 검토 후보')[0];
const rows=[...sec.matchAll(/^\| (\d+)\((\d+)\) \| (\d+)\((\d+)\) \| (\d+)\((\d+)\) \| (\S+) \| (\d+) \|.*? \| (\w+) \| (.*?) \| .*? \| (.*?) \| (.*?) \|$/gm)];
console.log('fb rows',rows.length);
const fbMeta=rows.map(m=>({id:m[8],down:m[1],mid:m[3],up:m[5],chanjong:m[7],reason:m[12]}));
const fids=fbMeta.map(x=>x.id);
const fq=(await db.query(`select q.id::text,q.question_text,q.display_answer,q.explanation,q.general_hint,q.difficulty_score,q.worth,(select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary) variants from questions q where q.id=any($1::bigint[])`,[fids])).rows;
const fm=Object.fromEntries(fq.map(r=>[r.id,r]));
fbMeta.forEach(x=>Object.assign(x,fm[x.id]));
fs.writeFileSync(D+'targets-feedback-38.json',JSON.stringify({frozenAt:new Date().toISOString(),items:fbMeta},null,1));
// open
const oo=(await db.query(`select q.id::text,q.question_text,q.display_answer,q.explanation,q.general_hint,(select json_agg(json_build_object('t',answer_text,'p',is_primary)) from question_answers a where a.question_id=q.id) answers from questions q where q.id in (2189,2653)`)).rows;
fs.writeFileSync(D+'targets-open-2.json',JSON.stringify(oo,null,1));
// g029 26
const miss=JSON.parse(fs.readFileSync('data/pipeline/audit/g029-blind-miss.json','utf8'));
const keep=[881,1070,1874,2964,3733,4190,4214,4430,4453,4503,4528,4968,6238,6313];
const gids=[...Object.keys(miss.items),...keep.map(String)];
const gq=(await db.query(`select q.id::text,q.question_text,q.display_answer,q.explanation,q.general_hint,(select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary) variants from questions q where q.id=any($1::bigint[])`,[gids])).rows;
fs.writeFileSync(D+'targets-g029-26.json',JSON.stringify({miss:Object.keys(miss.items),keep,items:gq,missGuess:miss.items},null,1));
console.log('g029',gq.length,'oo',oo.length);
await db.end();
