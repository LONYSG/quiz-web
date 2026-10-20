import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const A='C:/work/quiz-web/data/pipeline/audit'; const J=f=>JSON.parse(fs.readFileSync(f,'utf8')); const one=s=>(s??'').replace(/\s*\n\s*/g,' ').trim();
const v14=J(A+'/v014-results.json').items, v16=J(A+'/v016-results.json').items;
const pool=[]; for(const [src,v,tag] of [['g009a',v14,'g009a'],['g009b',v16,'g009b']]) for(const x of Object.values(v)) if(x.verdict==='ok'&&/애매/.test(x.note||'')) pool.push({tag,ref:x.ref,x});
const boundary=['S3-07','S2-21','S2-12','L2-26','C1-22','S3-05','L2-04'];
// 표본: 묶음(출처 × 머리글자)별 비례, 시드
let seed=20261020; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const groups={}; for(const p of pool){ if(p.tag==='g009b'&&boundary.includes(p.ref)) continue; const k=p.tag+'/'+p.ref[0]; (groups[k]??=[]).push(p); }
const N=60; const total=Object.values(groups).reduce((s,a)=>s+a.length,0); const picked=[];
const keys=Object.keys(groups).sort(); const alloc={}; let rem=N;
for(const k of keys){alloc[k]=Math.floor(groups[k].length*N/total); rem-=alloc[k];}
const fr=keys.map(k=>[k,groups[k].length*N/total-alloc[k]]).sort((a,b)=>b[1]-a[1]); for(let i=0;rem>0;i++,rem--) alloc[fr[i%fr.length][0]]++;
for(const k of keys) picked.push(...sh(groups[k]).slice(0,alloc[k]));
for(const r of boundary){ const x=v16[r]; if(!x){console.log('경계 없음',r);continue;} picked.push({tag:'g009b',ref:r,x,boundary:true}); }
const c=new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows=(await c.query(`select q.id,q.question_text,q.display_answer,q.explanation,q.general_hint,q.difficulty_score d,q.source_ref,q.is_active,
 coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants from questions q`)).rows; await c.end();
const act=rows.filter(r=>r.is_active); const byRef=new Map(); for(const r of rows){const m=(r.source_ref||'').match(/#(g009[ab])-([A-Z0-9]+-\d+)/); if(m) byRef.set(m[1]+'/'+m[2],r);}
const prim=new Map(); for(const r of act){const n=normalizeAnswer(r.display_answer); if(!prim.has(n)) prim.set(n,[]); prim.get(n).push(r);}
const items=[];
for(const p of picked){ const r=byRef.get(p.tag+'/'+p.ref); if(!r){items.push({ref:p.ref,tag:p.tag,missing:true});continue;}
 const same=(prim.get(normalizeAnswer(r.display_answer))||[]).filter(x=>x.id!==r.id).map(x=>({id:Number(x.id),q:one(x.question_text),e:one(x.explanation),h:one(x.general_hint)}));
 const facts=(p.x.facts||[]).map(f=>`[${f.where}] ${f.claim} → ${f.result}${f.source?' <'+f.source+'>':''}`).join('  ||  ');
 items.push({key:p.tag+'/'+p.ref,ref:p.ref,tag:p.tag,boundary:!!p.boundary,id:Number(r.id),active:r.is_active,dbDifficulty:r.d,q:one(r.question_text),a:r.display_answer,variants:r.variants,e:one(r.explanation),h:one(r.general_hint),prevNote:one(p.x.note),prevReason:one(p.x.reason),prevDif:p.x.score?.dif,facts,same});}
fs.writeFileSync('b-items.json',JSON.stringify(items,null,1));
const fmt=x=>x.missing?`### ${x.tag}/${x.ref} DB 에 없음\n`:[`### ${x.key}  #${x.id}${x.active?'':' (비활성)'}${x.boundary?'  [3-3 경계]':''}`,`Q: ${x.q}`,`A: ${x.a}${x.variants.length?'   변형: '+x.variants.join(' | '):''}`,`E: ${x.e}`,`H: ${x.h||'(없음)'}`,`이전 판정자 사실 확인(참고 — 다시 열어 대조할 것): ${x.facts}`,`이전 판정자 메모: ${x.prevNote}`,...x.same.map(s=>`  sameAnswerActive #${s.id}: Q: ${s.q} | E: ${s.e} | H: ${s.h||'(없음)'}`),''].join('\n');
const half=Math.ceil(items.length/2);
for(const [i,a] of [items.slice(0,half),items.slice(half)].entries()){fs.writeFileSync(`b${i+1}.txt`,`## 애매 재판정 조각 b${i+1} (${a.length}건)\n\n`+a.map(fmt).join('\n'));fs.writeFileSync(`b${i+1}.keys.json`,JSON.stringify(a.map(x=>x.key||x.tag+'/'+x.ref)));}
console.log(JSON.stringify({pool:pool.length,alloc,picked:picked.length,items:items.length,missing:items.filter(x=>x.missing).length,ok:rows.length}));
