import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const A='C:/work/quiz-web/data/pipeline/audit'; const J=f=>JSON.parse(fs.readFileSync(f,'utf8')); const one=s=>(s??'').replace(/\s*\n\s*/g,' ').trim();
let seed=20261020; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}; const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const g17=J(A+'/g017-fixes.json'); const hrows=g17.parts.h.rows; const arows=g17.parts.a.rows; const nt=g17.parts.a.notTaken;
const isGen=r=>/제안 힌트 없음/.test(r.why); const isEdit=r=>/partial|letters 만 고침/.test(r.why);
const gen=hrows.filter(isGen), edit=hrows.filter(r=>!isGen(r)&&isEdit(r)), taken=hrows.filter(r=>!isGen(r)&&!isEdit(r));
const refill=taken.filter(r=>/CV-56/.test(r.why)); const refillPick=sh(refill).slice(0,10);
const hsel=[...gen.map(r=>({r,kind:'gen'})),...edit.map(r=>({r,kind:'edit'})),...refillPick.map(r=>({r,kind:'refill'}))];
// ④ 난이도 1 fix 반영 94 중 30 · 받지 않은 변형 41 중 10
const idsApplied=[...new Set(arows.map(r=>r.id))]; const pick30=sh(idsApplied).slice(0,30);
const ntIds=[...new Set(nt.map(r=>r.id))]; const ntPick=sh(nt).slice(0,10);
const c=new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows=(await c.query(`select q.id,q.question_text,q.display_answer,q.explanation,q.general_hint,q.difficulty_score d,q.is_active,q.source_ref,
 coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants from questions q`)).rows; await c.end();
const by=new Map(rows.map(r=>[Number(r.id),r])); const act=rows.filter(r=>r.is_active);
const prim=new Map(); for(const r of act){const n=normalizeAnswer(r.display_answer); if(!prim.has(n)) prim.set(n,[]); prim.get(n).push(r);}
// --- 힌트 조각 h
const hitems=hsel.map(({r,kind})=>{const q=by.get(r.id);const same=(prim.get(normalizeAnswer(q.display_answer))||[]).filter(x=>Number(x.id)!==r.id).map(x=>({id:Number(x.id),q:one(x.question_text),e:one(x.explanation),h:one(x.general_hint)}));
 const chk=q.general_hint?checkHint({hint:q.general_hint,answer:q.display_answer,variants:q.variants||[],question:q.question_text,explanation:q.explanation||''}):null;
 return {id:r.id,kind,why:r.why,sources:r.sources||[],before:r.before,d:q.d,active:q.is_active,q:one(q.question_text),a:q.display_answer,variants:q.variants,e:one(q.explanation),h:one(q.general_hint),same,warn:chk?{block:chk.block.map(w=>w.kind),warn:chk.warn.map(w=>w.kind)}:null};});
const kn={gen:'G017 이 제안 없이 새로 씀',edit:'G017 이 판정자 제안을 문서대로 고쳐 씀',refill:'비었던 힌트를 판정자 제안 그대로 다시 채움'};
const hfmt=x=>[`### #${x.id}  [${kn[x.kind]}]  난이도 ${x.d}`,`Q: ${x.q}`,`A: ${x.a}${x.variants.length?'   변형: '+x.variants.join(' | '):''}`,`E: ${x.e}`,`H: ${x.h}`,`이전 힌트(바꾸기 전): ${x.before??'(없음)'}`,`hintSources: ${x.sources.join(' ; ')||'(없음)'}`,`GEN 사유: ${one(x.why)}`,...x.same.map(s=>`  sameAnswerActive #${s.id}: Q: ${s.q} | E: ${s.e} | H: ${s.h||'(없음)'}`),`hint-check: block=[${x.warn?.block.join(',')??''}] warn=[${x.warn?.warn.join(',')??''}]`,''].join('\n');
fs.writeFileSync('h.txt',`## G017 힌트 표본 ${hitems.length}건 (쓴 ${gen.length} · 고쳐 쓴 ${edit.length} · 다시 채운 ${refill.length} 중 ${refillPick.length})\n\n`+hitems.map(hfmt).join('\n')); fs.writeFileSync('h.ids.json',JSON.stringify(hitems.map(x=>x.id)));
const bl=hitems.filter(x=>x.h); const bmap=bl.map((x,i)=>({b:'b'+String(i+1).padStart(3,'0'),id:x.id})); fs.writeFileSync('blind-map.json',JSON.stringify(bmap)); fs.writeFileSync('blind.txt',bl.map((x,i)=>`${bmap[i].b}\t${x.h}`).join('\n')+'\n');
// --- ②③④
const v18=Object.values(J(A+'/v018-active1.json').items); const v18by=new Map(v18.map(x=>[Number(x.id),x]));
const rowsOf=id=>arows.filter(r=>r.id===id); const crows=g17.parts.c.rows;
const fields=['question_text','explanation','general_hint','display_answer'];
const cur=id=>{const q=by.get(id);return `현재 DB: Q: ${one(q.question_text)} | A: ${q.display_answer}${q.variants.length?' | 변형: '+q.variants.join(' · '):''} | E: ${one(q.explanation)} | H: ${one(q.general_hint)||'(없음)'} | ${q.is_active?'활성':'비활성'}`};
const blocks=[];
// ② 정리 3
for(const id of [2051,940,1035]){const rs=crows.filter(r=>r.id===id);blocks.push([`### #${id}  [② 정리 — 다시 살린 문항]`,cur(id),...rs.map(r=>`  바꾼 칸 ${r.field}: ${one(String(r.before))} ⇒ ${one(String(r.after))}   (사유: ${one(r.why).slice(0,260)})`),''].join('\n'));}
// ③ 줄인 질문 3
for(const id of [6000,5327,5700]){const rs=arows.filter(r=>r.id===id&&r.field==='question_text');const rs2=crows.filter(r=>r.id===id&&r.field==='question_text');const x=[...rs,...rs2];blocks.push([`### #${id}  [③ 긴 질문 줄임]`,cur(id),...x.map(r=>`  줄이기 전: ${one(String(r.before))} (${String(r.before).length}자)\n  줄인 뒤: ${one(String(r.after))} (${String(r.after).length}자)   (사유: ${one(r.why).slice(0,200)})`),''].join('\n'));}
// ④ 반영 30
const fmt4=id=>{const q=by.get(id);const p=v18by.get(id);const rs=rowsOf(id);const L=[`### #${id}  [④ fix 반영]`,cur(id),`V018 판정: ${p?.verdict} · 사유 ${(p?.categories||[]).join(',')} · ${one(p?.reason||'')}`,`V018 제안: ${JSON.stringify(p?.proposal||{})}`];for(const r of rs)L.push(`  반영 ${r.field}: ${one(String(r.before))} ⇒ ${one(String(r.after))}   (${one(r.why).slice(0,120)})`);const nt2=nt.filter(r=>r.id===id);for(const r of nt2)L.push(`  받지 않음 ${r.field}: ${JSON.stringify(r.proposal)} — ${one(r.why).slice(0,160)}`);L.push('');return L.join('\n')};
for(const id of pick30) blocks.push(fmt4(id));
// ④ 받지 않은 변형 10
for(const r of ntPick){const q=by.get(r.id);const p=v18by.get(r.id);blocks.push([`### #${r.id}  [④ 받지 않은 변형 제안]`,cur(r.id),`V018 판정: ${p?.verdict} · ${(p?.categories||[]).join(',')} · ${one(p?.reason||'')}`,`제안 변형: ${JSON.stringify(r.proposal)}   받지 않은 사유(GEN): ${one(r.why)}`,''].join('\n'));}
const NP=2; const per=Math.ceil(blocks.length/NP); const idsAll=[];
for(let i=0;i<NP;i++){const a=blocks.slice(i*per,(i+1)*per);fs.writeFileSync(`g${i+1}.txt`,`## G017 반영 표본 조각 g${i+1} (${a.length}건)\n\n`+a.join('\n'));fs.writeFileSync(`g${i+1}.keys.json`,JSON.stringify(a.map(b=>b.split('\n')[0].replace(/^### /,'').split('  ')[0])));}
fs.writeFileSync('g-sample.json',JSON.stringify({dbDifficulty:Object.fromEntries([...pick30,...ntPick.map(r=>r.id),2051,940,1035,6000,5327,5700].map(id=>[id,by.get(id).d])),hGen:gen.map(r=>r.id),hEdit:edit.map(r=>r.id),hRefillAll:refill.map(r=>r.id),hRefillPick:refillPick.map(r=>r.id),pick30,ntPick:ntPick.map(r=>({id:r.id,field:r.field,proposal:r.proposal})),appliedIds:idsApplied.length,ntRows:nt.length,ntIds:ntIds.length}));
console.log(JSON.stringify({h:hitems.length,gen:gen.length,edit:edit.length,taken:taken.length,refill:refill.length,hBlind:bl.length,idsApplied:idsApplied.length,notTaken:nt.length,ntIds:ntIds.length,blocks:blocks.length,perPiece:per}));
