import fs from 'node:fs';import {normalizeAnswer as N} from '../../../../../shared/dist/index.js';
const D='data/pipeline/audit/v038-raw/';const T=JSON.parse(fs.readFileSync(D+'targets.json','utf8')).items;const tm=new Map(T.map(i=>[i.id,i]));
const out=[];
for(let p=1;p<=12;p++){const k='p'+String(p).padStart(2,'0');const A=JSON.parse(fs.readFileSync(D+`out/${k}-A.json`));const B=JSON.parse(fs.readFileSync(D+`out/${k}-B.json`));
 const bm=new Map(B.map(b=>[String(b.id),b]));
 for(const a of A){const t=tm.get(String(a.id));const b=bm.get(String(a.id));if(!b)throw new Error('B 없음 '+a.id);
  const g=N(String(a.guess||''));const hit=g.length>=1&&a.guess!=='?'&&[t.display_answer,...(t.variants||[])].some(x=>{const n=N(x);return n&&(n.includes(g)||g.includes(n))});
  out.push({id:t.id,grade:t.grade,worth:t.worth,l2:t.l2,piece:t.piece,group:t.group,mach:t.mach,g030_seen:t.g030_seen,g030_fixed:t.g030_fixed,qlen:t.qlen,
   ask:a.ask,guess:a.guess,read:a.read,read_why:a.read_why,guess_hit:hit,...b,id:t.id,reread:false})}}
fs.writeFileSync('data/pipeline/audit/v038-refurb.json',JSON.stringify({round:'V037',n:out.length,items:out},null,1));
console.log('merged',out.length);
