import fs from 'node:fs';import pg from 'pg';
const P='data/pipeline/audit/';const D=P+'v038-raw/';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const rows=(await db.query(`select q.id::text id,q.question_text,q.display_answer,q.general_hint,q.explanation,q.difficulty_score grade,q.worth,
 c.name_ko l2, (select array_agg(answer_text order by id) from question_answers a where a.question_id=q.id and not a.is_primary) variants
 from questions q left join categories c on c.id=q.category_id where q.status='approved' and q.is_active and q.worth=3 and q.difficulty_score<=2 order by q.id`)).rows;
await db.end();
const v37=new Set(JSON.parse(fs.readFileSync(P+'v037-refurb.json','utf8')).items.map(i=>i.id));
const g34=new Set(Object.entries(JSON.parse(fs.readFileSync(P+'g034-decisions.json','utf8')).items).filter(([k,v])=>v.step==='B').map(([k])=>k));
const sents=t=>t.split(/(?<=[.?!])\s+/).filter(Boolean);
const dem=/(이|그|저) [가-힣]{1,8}(은|는|이|가|을|를|의|에|으로|로) .*(이|그|저) [가-힣]{1,8}(은|는|이|가|을|를|의|에|으로|로) /;
const conn=/(고|며|지만|는데|으며|되며|하며|인데|라서|면서),? /g;
function mach(q){const w=[];if(q.length>160)w.push('len160');if((q.match(/,/g)||[]).length>=3)w.push('comma3');if(dem.test(q))w.push('dem2');
 if((q.match(conn)||[]).length>=3)w.push('conn3');
 const ss=sents(q);if(ss.length===1&&q.length>90)w.push('one90');if(ss.some(s=>[...s].length>70))w.push('sent70');return w}
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd=rng(20261109);const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pool=rows.filter(r=>!v37.has(r.id));
const items=[];const inA=new Set();
const new132=pool.filter(r=>{const m=mach(r.question_text);return m.includes('one90')||m.includes('sent70')});
// 새 기준 = 문장 70 초과 · 한 문장 90 초과 만 (CV-160). 기존 정규식 5종은 기계 후보 아님
for(const r of new132){items.push({...r,group:'a1',mach:mach(r.question_text)});inA.add(r.id)}
const g34L=pool.filter(r=>g34.has(r.id)&&!inA.has(r.id));
for(const r of g34L){items.push({...r,group:'a2',mach:mach(r.question_text)});inA.add(r.id)}
const rest=pool.filter(r=>!inA.has(r.id));
for(const r of shuffle(rest).slice(0,60))items.push({...r,group:'a3',mach:mach(r.question_text)});
for(const it of items)it.qlen=it.question_text.length;
const sh=shuffle(items);const NP=12;
sh.forEach((it,i)=>it.piece=Math.floor(i*NP/sh.length)+1);
const cnt={};for(const it of items){const k=it.group+'-g'+it.grade;cnt[k]=(cnt[k]||0)+1}
const g34all=pool.filter(r=>g34.has(r.id));
console.log('worth3 g12 total',rows.length,'minus V037',pool.length,'| new132',new132.length,'g34 active w3 g12',g34all.length,'(that overlap new132:',g34all.length-g34L.length,')','a2 add',g34L.length,'a3 60','total',items.length,cnt);
console.log('v37 overlap',items.filter(i=>v37.has(i.id)).length);
fs.writeFileSync(D+'targets.json',JSON.stringify({frozenAt:new Date().toISOString(),n:items.length,seed:20261109,items:sh},null,1));
const bp={};for(const it of sh)bp[it.piece]=(bp[it.piece]||0)+1;console.log(bp);
for(let p=1;p<=NP;p++)fs.writeFileSync(D+`in/p${String(p).padStart(2,'0')}-A.json`,JSON.stringify(sh.filter(i=>i.piece===p).map(i=>({id:i.id,question_text:i.question_text})),null,1));
