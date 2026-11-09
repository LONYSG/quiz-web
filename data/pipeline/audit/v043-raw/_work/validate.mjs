import fs from 'node:fs'; import { canon } from './canon.mjs';
const R='data/pipeline/audit/v043-raw/', T='data/minigame/topics/';
const sets={}; const get=s=>sets[s]??=JSON.parse(fs.readFileSync(T+s+'.json'));
const out={}, issues=[]; const seen={};
for (const f of fs.readdirSync(R).filter(f=>/^C.*\.json$/.test(f))) {
  const j=JSON.parse(fs.readFileSync(R+f));
  for (const [s,v] of Object.entries(j.sets)) { const t=get(s);
    (seen[s]??=[]).push([f,v.items]);
    const byId=new Map(t.items.map(i=>[i.id,i]));
    const owner=new Map(); for(const i of t.items){owner.set(canon(i.name),i.id);for(const x of i.variants)owner.set(canon(x),i.id);}
    const o=out[s]??={items:0,proposals:[],unsure:[]}; o.items+=v.items; o.unsure.push(...(v.unsure||[]));
    for (const p of v.proposals) { const it=byId.get(p.id); if(!it){issues.push(`${f} ${p.id} 없음`);continue;}
      if(it.name!==p.name) issues.push(`${f} ${p.id} name 불일치 '${p.name}'≠'${it.name}'`);
      const add=[]; const have=new Set([canon(it.name),...it.variants.map(canon)]);
      for (const a of p.add||[]) { const c=canon(a);
        if(!c) {issues.push(`${p.id} 빈 add`);continue;}
        if(have.has(c)){issues.push(`${p.id} '${a}' 이미 받음→제외`);continue;}
        if(owner.has(c)&&owner.get(c)!==p.id){issues.push(`${p.id} '${a}' 겹침 ${owner.get(c)}→제외`);continue;}
        have.add(c);add.push(a);}
      const rem=[]; for (const r of p.remove||[]) { if(!it.variants.includes(r.v)) {issues.push(`${p.id} remove '${r.v}' 현재 변형 아님→제외`);continue;} rem.push(r);}
      if(add.length>4) issues.push(`${p.id} add ${add.length}>4`);
      if(add.length||rem.length) o.proposals.push({...p,add,remove:rem}); }
  }}
for (const [s,t] of Object.entries(sets)) { const n=out[s]?.items; if(n!==t.items.length) issues.push(`수 불일치 ${s}: 본 ${n} / ${t.items.length}`); }
for (const s of Object.keys(sets)) { if(seen[s].length>2) issues.push('여러 번 '+s); }
fs.writeFileSync(R+'_work/merged.json',JSON.stringify(out,null,1));
console.log(Object.keys(out).length,'세트'); console.log(issues.join('\n'));
