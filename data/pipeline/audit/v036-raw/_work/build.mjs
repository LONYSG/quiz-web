import fs from 'node:fs';import pg from 'pg';
const P='data/pipeline/';const D=P+'audit/v036-raw/';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const s=JSON.parse(fs.readFileSync(P+'audit/v035-g032.json','utf8'));const ex=(s.items||s).map(x=>String(x.id));
const rows=(await db.query(`select q.id::text,q.question_text,q.display_answer,q.explanation,q.general_hint,q.worth,q.difficulty_score,q.difficulty_why,q.worth_why,q.source_ref,q.category_id,(select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary) variants from questions q where q.status='pending_review' and q.is_active=false and q.id<>all($1::bigint[]) order by q.id`,[ex])).rows;
console.log('rows',rows.length);
const gen={};
for(const sub of ['g032a','g032b']){for(const f of fs.readdirSync(P+'generated/'+sub)){if(!f.endsWith('.json'))continue;const j=JSON.parse(fs.readFileSync(P+'generated/'+sub+'/'+f,'utf8'));const arr=Array.isArray(j)?j:(j.items||j.questions||[]);for(const it of arr){if(it.seedId)gen[it.seedId]=it.question}}}
const dup=JSON.parse(fs.readFileSync(P+'audit/g032-dup.json','utf8'));
const pairs={};// seed -> [other]
for(const k of ['g032a','g032b']){for(const arr of [dup[k].same||[],dup[k].unsure||[]]){for(const p of arr){const [a,b]=p.pair.split('~');(pairs[a]=pairs[a]||[]).push({other:b,why:p.why})}}}
const bySeed={};for(const r of rows){bySeed[r.source_ref.split('#').pop().replace(/^g032[ab]-/,'')]=r;}
const items=[];let miss=0;
for(const r of rows){const seed=r.source_ref.split('#').pop().replace(/^g032[ab]-/,'');const g=gen[r.source_ref]||null;if(!g)miss++;
 const pr=pairs[seed]||pairs[r.source_ref.split('#').pop()]||[];let pq=[];
 for(const p of pr){const o=p.other;if(/^\d+$/.test(o)){const x=(await db.query(`select id::text,question_text,display_answer,general_hint from questions where id=$1`,[o])).rows[0];if(x)pq.push({...x,pairWhy:p.why})}else{const os=o.replace(/^g032[ab]:/,'').replace(/^g032[ab]-/,'');const x=bySeed[os];pq.push({id:x?.id||o,question_text:x?.question_text,display_answer:x?.display_answer,general_hint:x?.general_hint,pairWhy:p.why,intraRound:true})}}
 items.push({id:r.id,q:r.question_text,answer:r.display_answer,variants:r.variants||[],explanation:r.explanation,hint:r.general_hint,worthStored:r.worth,
  facts:g?(g.facts||[]).map(f=>({claim:f.claim,where:f.where,url:f.url,note:(f.note||'').slice(0,300)})):null,sources:g?.sources||null,hintBasis:g?.hintBasis||null,pairedActive:pq,
  _score:{dif:r.difficulty_score,difWhy:r.difficulty_why,worth:r.worth,worthWhy:r.worth_why,source_ref:r.source_ref,cat:r.category_id}});}
console.log('no gen',miss,'with pairs',items.filter(i=>i.pairedActive.length).length);
fs.writeFileSync(D+'targets-g032-484.json',JSON.stringify({frozenAt:new Date().toISOString(),n:items.length,items},null,1));
const per=50,np=Math.ceil(items.length/per);
for(let p=0;p<np;p++){const sl=items.slice(p*per,(p+1)*per).map(({_score,...x})=>x);fs.writeFileSync(D+`in/g032-p${String(p+1).padStart(2,'0')}.json`,JSON.stringify(sl,null,1));}
console.log('pieces',np);
const sc={};for(const i of items){const d=i._score.dif;sc[d]=(sc[d]||0)+1}console.log('scoreV4 dist',sc);
await db.end();
