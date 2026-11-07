import fs from 'node:fs';import pg from 'pg';
const P='data/pipeline/';const D=P+'audit/v035-raw/';
fs.mkdirSync(D+'in',{recursive:true});fs.mkdirSync(D+'out',{recursive:true});
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const vt=JSON.parse(fs.readFileSync(P+'audit/g032-verify-targets.json','utf8'));
const ids=vt.items.map(i=>String(i.id));
const rows=(await db.query(`select q.id::text,q.question_text,q.display_answer,q.explanation,q.general_hint,q.worth,q.difficulty_score,q.difficulty_why,q.worth_why,q.source_ref,q.category_id,(select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary) variants from questions q where q.id=any($1::bigint[]) and q.status='pending_review'`,[ids])).rows;
const byId=Object.fromEntries(rows.map(r=>[r.id,r]));
// generated index
const gen={};
for(const sub of ['g032a','g032b']){for(const f of fs.readdirSync(P+'generated/'+sub)){if(!f.endsWith('.json'))continue;const j=JSON.parse(fs.readFileSync(P+'generated/'+sub+'/'+f,'utf8'));const arr=Array.isArray(j)?j:(j.items||j.questions||[]);for(const it of arr){if(it.seedId)gen[it.seedId]=it}}}
console.log('gen indexed',Object.keys(gen).length);
const dup=JSON.parse(fs.readFileSync(P+'audit/g032-dup.json','utf8'));
const items=[];let miss=0;
for(const v of vt.items){const r=byId[String(v.id)];if(!r){console.log('no row',v.id);continue}
 const g=gen[r.source_ref]||null;if(!g)miss++;
 // paired old active
 const pairs=[...(v.why.matchAll(/~(\d+)\s/g))].map(m=>m[1]);
 let pq=[];if(pairs.length){pq=(await db.query(`select id::text,question_text,display_answer,general_hint from questions where id=any($1::bigint[])`,[pairs])).rows}
 items.push({id:r.id,why:v.why,q:r.question_text,answer:r.display_answer,variants:r.variants||[],explanation:r.explanation,hint:r.general_hint,worthStored:r.worth,
  facts:g?(g.facts||[]).map(f=>({claim:f.claim,where:f.where,url:f.url,note:(f.note||'').slice(0,300)})):null,sources:g?.sources||null,hintBasis:g?.hintBasis||null,pairedActive:pq,
  _score:{dif:r.difficulty_score,difWhy:r.difficulty_why,worth:r.worth,worthWhy:r.worth_why}});}
console.log('items',items.length,'no gen',miss);
fs.writeFileSync(D+'targets-g032.json',JSON.stringify({frozenAt:new Date().toISOString(),n:items.length,items},null,1));
// pieces: judge input w/o score
const pieces=4;const per=Math.ceil(items.length/pieces);
for(let p=0;p<pieces;p++){const sl=items.slice(p*per,(p+1)*per).map(({_score,...x})=>x);fs.writeFileSync(D+`in/g032-p${p+1}.json`,JSON.stringify(sl,null,1));console.log('piece',p+1,sl.length)}
await db.end();
