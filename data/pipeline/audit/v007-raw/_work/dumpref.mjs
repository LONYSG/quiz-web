import fs from 'node:fs';
const SC='C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const RAW='C:/work/quiz-web/data/pipeline/audit/v007-raw';
const refs=new Set(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
const items=new Map(JSON.parse(fs.readFileSync(SC+'/items.json','utf8')).map(x=>[x.ref,x]));
const one=s=>(s??'').toString().replace(/\s*\n\s*/g,' ');
for(let i=1;i<=7;i++){const f=`${RAW}/j${i}.out.json`;if(!fs.existsSync(f))continue;
 for(const r of JSON.parse(fs.readFileSync(f,'utf8'))){ if(!refs.has(r.ref))continue; const x=items.get(r.ref);
  console.log(`## ${r.ref} [${r.verdict}] ${x.topic}/${x.sub} A=${x.answer}${x.variants.length?' V='+x.variants.join('|'):''} dif GEN${x.score.dif}->${r.score?.dif} opened=${r.webOpened}`);
  console.log(' Q: '+one(x.question));console.log(' E: '+one(x.explanation));console.log(' H: '+one(x.hint));
  console.log(' difWhy: '+one(r.score?.difWhy));console.log(' reason: '+one(r.reason));
  if(r.hintRead?.alone)console.log(' alone: '+one(r.hintRead.alone));
  console.log();}}
