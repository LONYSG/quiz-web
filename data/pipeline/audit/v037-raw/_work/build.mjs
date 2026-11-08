import fs from 'node:fs';import pg from 'pg';
const P='data/pipeline/audit/';const D=P+'v037-raw/';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const rows=(await db.query(`select q.id::text id,q.question_text,q.display_answer,q.general_hint,q.explanation,q.difficulty_score grade,q.worth,
 c.name_ko l2, (select array_agg(answer_text order by id) from question_answers a where a.question_id=q.id and not a.is_primary) variants
 from questions q left join categories c on c.id=q.category_id where q.status='approved' and q.is_active and q.worth=3 order by q.id`)).rows;
await db.end();
const sents=t=>t.split(/(?<=[.?!])\s+/).filter(Boolean);
const dem=/(이|그|저) [가-힣]{1,8}(은|는|이|가|을|를|의|에|으로|로) .*(이|그|저) [가-힣]{1,8}(은|는|이|가|을|를|의|에|으로|로) /;
const conn=/(고|며|지만|는데|으며|되며|하며|인데|라서|면서),? /g;
function mach(q){const w=[];if(q.length>160)w.push('len160');if((q.match(/,/g)||[]).length>=3)w.push('comma3');if(dem.test(q))w.push('dem2');
 if((q.match(conn)||[]).length>=3)w.push('conn3');if(sents(q).length===1&&q.length>90)w.push('one90');return w}
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd=rng(20261108);const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const seen=new Set(),fixed=new Set();
for(const it of JSON.parse(fs.readFileSync(P+'g030-read-candidates.json','utf8')).items)seen.add(String(it.id));
const pl=JSON.parse(fs.readFileSync(P+'g030-plan-text.json','utf8'));
for(const [k,v] of Object.entries(pl)){if(!k.startsWith('read-q'))continue;for(const id of Object.keys(v)){seen.add(id);fixed.add(id)}}
const A=rows.filter(r=>r.grade>=3),L=rows.filter(r=>r.grade<=2);
const items=[];
for(const r of A)items.push({...r,group:'a',mach:mach(r.question_text)});
const Bs=[],rest=[];for(const r of L){const m=mach(r.question_text);(m.length?Bs:rest).push({...r,mach:m})}
for(const r of Bs)items.push({...r,group:'b'});
for(const r of shuffle(rest).slice(0,60))items.push({...r,group:'c'});
for(const it of items){it.g030_seen=seen.has(it.id);it.g030_fixed=fixed.has(it.id);it.qlen=it.question_text.length}
const sh=shuffle(items);const NP=20,per=Math.ceil(sh.length/NP);
sh.forEach((it,i)=>it.piece=Math.floor(i*NP/sh.length)+1);
const cnt={};for(const it of items){const k=it.group+it.grade;cnt[k]=(cnt[k]||0)+1}
console.log('A',A.length,'L12',L.length,'b',Bs.length,'c',60,'total',items.length,'per',per,cnt,'seen',items.filter(i=>i.g030_seen).length,'fixed',items.filter(i=>i.g030_fixed).length);
fs.writeFileSync(D+'targets.json',JSON.stringify({frozenAt:new Date().toISOString(),n:items.length,seed:20261108,items:sh},null,1));
const bp={};for(const it of sh){bp[it.piece]=(bp[it.piece]||0)+1}console.log(bp);
for(let p=1;p<=NP;p++){fs.writeFileSync(D+`in/p${String(p).padStart(2,'0')}-A.json`,JSON.stringify(sh.filter(i=>i.piece===p).map(i=>({id:i.id,question_text:i.question_text})),null,1))}
