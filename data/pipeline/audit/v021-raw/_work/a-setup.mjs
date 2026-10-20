import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const A='C:/work/quiz-web/data/pipeline/audit'; const J=f=>JSON.parse(fs.readFileSync(f,'utf8')); const one=s=>(s??'').replace(/\s*\n\s*/g,' ').trim();
const v14=J(A+'/v014-results.json').items, v16=J(A+'/v016-results.json').items;
const done=new Set(J(A+'/v020-ambiguous.json').items.map(x=>x.key));
const pool=[]; for(const [tag,v] of [['g009a',v14],['g009b',v16]]) for(const x of Object.values(v)) if(x.verdict==='ok'&&/애매/.test(x.note||'')) pool.push({tag,ref:x.ref,x,key:tag+'/'+x.ref});
const rest=pool.filter(p=>!done.has(p.key)).sort((a,b)=>a.key.localeCompare(b.key));
const c=new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows=(await c.query(`select q.id,q.question_text,q.display_answer,q.explanation,q.general_hint,q.difficulty_score d,q.source_ref,q.is_active,
 coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants from questions q`)).rows; await c.end();
const act=rows.filter(r=>r.is_active); const byRef=new Map(); for(const r of rows){const m=(r.source_ref||'').match(/#(g009[ab])-([A-Z0-9]+-\d+)/); if(m) byRef.set(m[1]+'/'+m[2],r);}
const prim=new Map(); for(const r of act){const n=normalizeAnswer(r.display_answer); if(!prim.has(n)) prim.set(n,[]); prim.get(n).push(r);}
const items=[];
for(const p of rest){ const r=byRef.get(p.key); if(!r){items.push({key:p.key,missing:true});continue;}
 const same=(prim.get(normalizeAnswer(r.display_answer))||[]).filter(x=>x.id!==r.id).map(x=>({id:Number(x.id),q:one(x.question_text),e:one(x.explanation),h:one(x.general_hint)}));
 const facts=(p.x.facts||[]).map(f=>`[${f.where}] ${f.claim} → ${f.result}${f.source?' <'+f.source+'>':''}`).join('  ||  ');
 items.push({key:p.key,ref:p.ref,tag:p.tag,id:Number(r.id),active:r.is_active,dbDifficulty:r.d,q:one(r.question_text),a:r.display_answer,variants:r.variants,e:one(r.explanation),h:one(r.general_hint),prevNote:one(p.x.note),prevDif:p.x.score?.dif,facts,same});}
fs.writeFileSync('a-items.json',JSON.stringify(items,null,1));
const fmt=x=>x.missing?`### ${x.key} DB 에 없음\n`:[`### ${x.key}  #${x.id}${x.active?'':' (비활성)'}`,`Q: ${x.q}`,`A: ${x.a}${x.variants.length?'   변형: '+x.variants.join(' | '):''}`,`E: ${x.e}`,`H: ${x.h||'(없음)'}`,`이전 판정자 사실 확인(참고 — 다시 열어 대조할 것): ${x.facts}`,`이전 판정자 메모: ${x.prevNote}`,...x.same.map(s=>`  sameAnswerActive #${s.id}: Q: ${s.q} | E: ${s.e} | H: ${s.h||'(없음)'}`),''].join('\n');
const NP=Math.ceil(items.length/35); const per=Math.ceil(items.length/NP); const pieces=[];
for(let i=0;i<NP;i++){const a=items.slice(i*per,(i+1)*per);const name='a'+(i+1);fs.writeFileSync(`${name}.txt`,`## 애매 재판정 조각 ${name} (${a.length}건)\n\n`+a.map(fmt).join('\n'));fs.writeFileSync(`${name}.keys.json`,JSON.stringify(a.map(x=>x.key)));pieces.push([name,a.length]);}
fs.writeFileSync('pieces.json',JSON.stringify(pieces));
console.log(JSON.stringify({pool:pool.length,v14:pool.filter(p=>p.tag==='g009a').length,v16:pool.filter(p=>p.tag==='g009b').length,done:done.size,doneInPool:pool.filter(p=>done.has(p.key)).length,rest:rest.length,missing:items.filter(x=>x.missing).length,inactive:items.filter(x=>x.active===false).length,active:act.length,pieces}));
