import fs from 'node:fs';
const R='data/pipeline/audit/v048-raw/', T='data/minigame/topics/';
const SETS=['animal','brand','celebrity','character','food','fruit','instrument','job','movie','music','object','place','snack','sport','vehicle'];
const out={}, issues=[]; 
for (const f of fs.readdirSync(R).filter(f=>/^C(0)?-.*\.json$/.test(f))) { const j=JSON.parse(fs.readFileSync(R+f));
 for (const [s,v] of Object.entries(j.sets)) {  if(out[s]) {issues.push('중복 '+s+' '+f);} 
  const t=JSON.parse(fs.readFileSync(T+s+'.json')); const by=new Map(t.items.map(i=>[i.id,i]));
  if(v.items!==t.items.length) issues.push(`${s} items ${v.items}≠${t.items.length}`);
  const ids=new Set(); const keep=[];
  for(const p of v.issues){ const it=by.get(p.id); if(!it){issues.push(`${s} ${p.id} 없음`);continue;} if(ids.has(p.id)) issues.push('중복 id '+p.id); ids.add(p.id);
   for(const fl of p.fool||[]) if(!it.fool.includes(fl.f)) issues.push(`${p.id} fool '${fl.f}' 현재 fool 아님`);
   keep.push(p);}
  out[s]={items:t.items.length,issues:keep,unsure:v.unsure||[],file:f,okCount:t.items.length-ids.size};
  if(v.okCount!=null && v.okCount!==t.items.length-ids.size) issues.push(`${s} okCount ${v.okCount}≠${t.items.length-ids.size}`);
 }}
for(const s of SETS) if(!out['liar-'+s+'-2']) issues.push('없음 '+s);
fs.writeFileSync(R+'_work/merged.json',JSON.stringify(out,null,1));
let tc=0,tf=0,bd=0,rm=0; for(const v of Object.values(out)) for(const p of v.issues){ for(const f of p.fool||[]){f.v==='tooClose'?tc++:f.v==='tooFar'?tf++:bd++} if(p.probs.some(x=>x.t==='remove')) rm++; }
console.log('tooClose',tc,'tooFar',tf,'bad',bd,'remove항목',rm); console.log(issues.join('\n'));
