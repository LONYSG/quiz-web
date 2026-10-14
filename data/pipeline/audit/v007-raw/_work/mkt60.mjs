import fs from 'node:fs';
const SC='C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const refs=JSON.parse(fs.readFileSync(SC+'/t60-refs.json','utf8'));
const items=new Map(JSON.parse(fs.readFileSync(SC+'/items.json','utf8')).map(x=>[x.ref,x]));
const one=s=>(s??'').toString().replace(/\s*\n\s*/g,' ');
const W='C:/work/quiz-web/data/pipeline/audit/v007-raw/_work';
for(let k=0;k<3;k++){
 const part=refs.slice(k*20,(k+1)*20);
 let t='';
 for(const r of part){const x=items.get(r);
  t+=`### ${r}  답=${x.answer}\nQ: ${one(x.question)}\nE: ${one(x.explanation)}\nH: ${one(x.hint)}   hintSources: ${(x.hintSources||[]).join(' ; ')}\nfacts:\n`+x.facts.map((f,i)=>`  ${i+1}. [${f.where}] ${one(f.claim)} <${f.url}>`).join('\n')+'\n\n';}
 fs.writeFileSync(`${W}/t${k+1}.txt`,t);
 fs.writeFileSync(`${W}/t${k+1}.refs.json`,JSON.stringify(part));
}
console.log(refs.length);
