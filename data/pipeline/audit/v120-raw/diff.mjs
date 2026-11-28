// V120 1절 — 받은것 ↔ 보낼것 칸 대조 · DB 현재 글 대조
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import pg from 'pg';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R='C:/work/quiz-web/web-desk/tone/';
const sent=new Map(), got=new Map();
for (let i=1;i<=8;i++){const p='p0'+i;
  const b=JSON.parse(fs.readFileSync(`${R}보낼것/기존-고침-01-${p}.json`,'utf8').replace(/^\uFEFF/,''));
  const a=JSON.parse(fs.readFileSync(`${R}받은것/기존-고침-01-${p}.json`,'utf8').replace(/^\uFEFF/,''));
  if(!a.done) console.log('NOT DONE',p);
  for(const it of b.items) sent.set(String(it.key),{...it,pack:p});
  for(const c of a.cards) { if(got.has(String(c.key))) console.log('DUP',c.key); got.set(String(c.key),{...c,pack:p}); }
}
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'}); await db.connect();
const rows=(await db.query("select id,question_text,general_hint,explanation,display_answer,status,is_active from questions")).rows; const dbm=new Map(rows.map(r=>[String(r.id),r]));
const out={counts:{sent:sent.size,got:got.size,byStatus:{}},cards:{},mismatchGpt:[],noWhy:[],ansInTxt:[],blank:[],dbChanged:[],missingGot:[],extraGot:[]};
for(const k of sent.keys()) if(!got.has(k)) out.missingGot.push(k);
for(const k of got.keys()) if(!sent.has(k)) out.extraGot.push(k);
const norm=s=>(s??'').replace(/\s+/g,' ').trim();
for(const [k,g] of got){ out.counts.byStatus[g.status]=(out.counts.byStatus[g.status]??0)+1;
  const s=sent.get(k); if(!s) continue; const c=s.card;
  const real=[]; if(norm(g.question)!==norm(c.question)) real.push('q'); if(norm(g.hint)!==norm(c.hint)) real.push('hint'); if(norm(g.explanation)!==norm(c.explanation)) real.push('exp');
  const rec={status:g.status,pack:s.pack,real,gptChanged:g.changed??[],gptQ:!!g.qChanged,needsRegrade:!!s.needsRegrade,materialState:s.material?.state,why:g.why};
  const gc=[...(g.changed??[])].sort().join(); const rc=real.join();
  const exp2=real.slice().sort().join();
  if(g.status==='ready'){
    if(gc!==exp2 || (!!g.qChanged)!==real.includes('q')) out.mismatchGpt.push({key:k,gpt:g.changed,gptQ:g.qChanged,real});
    // why 에 걸린 칸
    const fields=new Set((s.why??[]).filter(w=>w.field).map(w=>w.field)); const reads=(s.why??[]).some(w=>w.kind==='read');
    const notIn=real.filter(f=>!fields.has(f)); if(notIn.length) out.noWhy.push({key:k,real,whyFields:[...fields],hasRead:reads});
    const ans=[c.answer,...(c.also??[])].filter(Boolean);
    for(const f of real){ const txt=f==='q'?g.question:f==='hint'?g.hint:g.explanation; const hit=ans.filter(a=>a.length>=2&&norm(txt).includes(a)); if(hit.length&&f!=='exp') out.ansInTxt.push({key:k,field:f,hit}); }
    if(!norm(g.question)||!norm(g.hint)||!norm(g.explanation)) out.blank.push(k);
    if(/^\d+$/.test(k)){const d=dbm.get(k); if(!d) out.dbChanged.push({key:k,why:'DB 에 없음'}); else if(norm(d.question_text)!==norm(c.question)||norm(d.general_hint)!==norm(c.hint)||norm(d.explanation)!==norm(c.explanation)) out.dbChanged.push({key:k,why:'글 다름'}); else if(d.status!=='approved'||!d.is_active) out.dbChanged.push({key:k,why:'status '+d.status+' '+d.is_active});}
  }
  out.cards[k]=rec;
}
fs.writeFileSync(path.join(HERE,'diff.json'),JSON.stringify(out,null,1));
const ready=Object.entries(out.cards).filter(([k,v])=>v.status==='ready');
const qch=ready.filter(([k,v])=>v.real.includes('q'));
console.log(JSON.stringify({...out.counts,missingGot:out.missingGot,extraGot:out.extraGot,mismatchGpt:out.mismatchGpt.length,noWhy:out.noWhy.length,ansInTxt:out.ansInTxt.length,blank:out.blank,dbChanged:out.dbChanged,readyN:ready.length,qChangedReal:qch.length,needsRegradeReady:ready.filter(([k,v])=>v.needsRegrade).length,nonNum:ready.filter(([k])=>!/^\d+$/.test(k)).map(([k])=>k),needKeys:Object.entries(out.cards).filter(([k,v])=>v.status==='need').map(([k])=>k),dropKeys:Object.entries(out.cards).filter(([k,v])=>v.status==='drop').map(([k])=>k)}));
await db.end();
