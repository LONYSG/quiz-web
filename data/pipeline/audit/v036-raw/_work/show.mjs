import fs from 'node:fs';
const o=JSON.parse(fs.readFileSync('data/pipeline/audit/v036-raw/merged-raw.json','utf8'));
const T=Object.fromEntries(JSON.parse(fs.readFileSync('data/pipeline/audit/v036-raw/targets-g032-484.json','utf8')).items.map(i=>[i.id,i]));
const fx=o.filter(x=>x.verdict!=='keep');const [a,b]=process.argv.slice(2).map(Number);
for(const x of fx.slice(a,b)){const t=T[x.id];
 console.log(`## ${x.id} ${x.answer} g${x.gradeIndep}/v4:${x.scoreV4} w${x.worthIndep}/${x.worthStored} fact:${x.fact} read:${x.read} hint:${x.hint}${x.hint_form?'('+x.hint_form+')':''}${x.unique_ok?'':' UNIQ✗'}`);
 console.log(' V:',x.verdict_why.slice(0,260));
 if(x.fact!=='true')console.log(' FF:',String(x.fact_fix||'').slice(0,260));
 if(x.hint==='fix')console.log(' H:',t.hint,'=>',x.hint_fix);
 if(x.read==='rewrite')console.log(' R:',String(x.read_fix||'').slice(0,260));
 if(x.missing_variants?.length)console.log(' MV:',x.missing_variants.join('|'));}
