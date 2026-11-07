import fs from 'node:fs';import pg from 'pg';
const A='data/pipeline/audit/';const D=A+'v035-raw/';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const plan=JSON.parse(fs.readFileSync(A+'g031-plan.json','utf8')).items;
let s=35;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/2**32};
const shuf=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const ids=Object.keys(plan);
const w1=ids.filter(i=>plan[i].worth===1);
const g1=shuf(ids.filter(i=>plan[i].grade===1&&plan[i].worth!==1)).slice(0,60);
const g2=shuf(ids.filter(i=>plan[i].grade===2&&plan[i].worth!==1)).slice(0,75);
// knowledge hints with specifics
const kn={};const mandatory=['4193','4187','2719','4662','3180','2565'];
for(const f of fs.readdirSync(A+'g031-raw').filter(x=>/^h-\d+\.out\.json$/.test(x))){for(const o of JSON.parse(fs.readFileSync(A+'g031-raw/'+f,'utf8'))){kn[o.ref]={basis:o.hintBasis,note:o.hintNote,core:o.core}}}
const spec=/\d{3,}|\d+(만|억|원|명|개|년|번|%)|[「'"“‘]/;
const knc=ids.filter(i=>kn[i]?.basis==='knowledge');
console.log('knowledge',knc.length);
const chosen=new Set([...w1,...g1,...g2]);
const pool=shuf(knc.filter(i=>!chosen.has(i)&&!mandatory.includes(i)));
// need hint text from DB to test specifics
const all=[...new Set([...chosen,...mandatory,...pool.slice(0,400)])];
const rows=(await db.query(`select q.id::text,q.question_text,q.display_answer,q.explanation,q.general_hint,q.general_hint_version,q.worth,q.difficulty_score,(select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary) variants from questions q where q.id=any($1::bigint[])`,[all])).rows;
const R=Object.fromEntries(rows.map(r=>[r.id,r]));
const spk=pool.filter(i=>R[i]&&spec.test(R[i].general_hint||'')).slice(0,34);
const k40=[...mandatory.filter(i=>R[i]),...spk].slice(0,40);
console.log('k40',k40.length);
const sel=[...new Set([...w1,...g1,...g2,...k40])];
const items=sel.map(i=>{const r=R[i];if(!r)return null;return {id:i,group:(k40.includes(i)?'K':'')+(w1.includes(i)?'W1':'')+(g1.includes(i)?'G1':'')+(g2.includes(i)?'G2':''),grade:plan[i].grade,worth:plan[i].worth,q:r.question_text,answer:r.display_answer,variants:r.variants||[],explanation:r.explanation,hint:r.general_hint,hintVersion:r.general_hint_version,basis:kn[i]?.basis,hintNote:kn[i]?.note,core:kn[i]?.core}}).filter(Boolean);
console.log('items',items.length,'w1',w1.length);
fs.writeFileSync(D+'targets-g031-200.json',JSON.stringify({frozenAt:new Date().toISOString(),seed:35,items},null,1));
const per=Math.ceil(items.length/4);for(let p=0;p<4;p++)fs.writeFileSync(D+`in/g031-p${p+1}.json`,JSON.stringify(items.slice(p*per,(p+1)*per),null,1));
await db.end();
