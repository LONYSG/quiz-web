import fs from 'node:fs';
const R='data/pipeline/audit/v045-raw/', T='data/minigame/topics/';
const out={}, issues=[]; const seenItems={};
for (const f of fs.readdirSync(R).filter(f=>/^C(0)?-.*\.json$/.test(f))) { const j=JSON.parse(fs.readFileSync(R+f));
 for (const [s,v] of Object.entries(j.sets)) { const t=JSON.parse(fs.readFileSync(T+s+'.json')); const by=new Map(t.items.map(i=>[i.id,i]));
  const o=out[s]??={items:t.items.length,seen:0,issues:[],unsure:[]}; o.seen+=v.items; o.unsure.push(...(v.unsure||[]));
  const ids=new Set(o.issues.map(p=>p.id));
  for(const p of v.issues){ const it=by.get(p.id); if(!it){issues.push(`${s} ${p.id} 없음`);continue;} if(ids.has(p.id)){issues.push('중복 '+p.id);continue;} ids.add(p.id);
   if(it.name!==p.name) issues.push(`${p.id} name ${p.name}≠${it.name}`);
   o.issues.push(p);} } }
let tot={remove:0,dup:0,diff:0,variant:0,sub:0,person:0,other:0}; let ni=0;
for (const [s,o] of Object.entries(out)) { if(o.seen!==o.items) issues.push(`${s} 본 ${o.seen}/${o.items}`); o.okCount=o.items-o.issues.length; ni+=o.items;
  for(const p of o.issues) for(const x of p.probs) tot[x.t]!==undefined?tot[x.t]++:tot.other++; }
fs.writeFileSync(R+'_work/merged.json',JSON.stringify(out,null,1));
console.log(Object.keys(out).length,'세트 항목',ni,JSON.stringify(tot)); console.log(issues.join('\n'));
