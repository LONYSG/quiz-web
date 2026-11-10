import fs from 'node:fs';
const T='data/minigame/topics/', R='data/pipeline/audit/v048-raw/_work/';
const SETS=['animal','brand','celebrity','character','food','fruit','instrument','job','movie','music','object','place','snack','sport','vehicle'];
for (const s of SETS){ const t=JSON.parse(fs.readFileSync(T+'liar-'+s+'-2.json')); const o=JSON.parse(fs.readFileSync(T+'liar-'+s+'.json'));
 let out='## liar-'+s+'-2 '+t.nameKo+' ('+t.items.length+')\n';
 for (const i of t.items) out+=i.id.split('-').pop()+' | '+i.name+(i.variants.length?' ['+i.variants.join(';')+']':'')+' | '+i.sub+' | '+i.era+' | d'+i.diff+' | fool: '+i.fool.join(' / ')+'\n';
 out+='\n## 기존 세트 liar-'+s+' 단어(겹침 확인용 — 이것은 판정하지 않음): '+o.items.map(i=>i.name).join(', ')+'\n';
 fs.writeFileSync(R+'in-'+s+'.txt',out); console.log(s,t.items.length,t.items.reduce((a,i)=>a+i.fool.length,0)); }
