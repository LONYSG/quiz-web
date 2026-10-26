import fs from 'node:fs';
const p=process.argv[2];const W='C:/work/quiz-web/data/pipeline/audit/v029-raw/_work/';
const o=JSON.parse(fs.readFileSync(W+p+'.out.json','utf8'));const k=JSON.parse(fs.readFileSync(W+p+'.keys.json','utf8'));const g=JSON.parse(fs.readFileSync(W+p+'.gold.json','utf8'));
console.log('n',o.length,k.length,'order',o.every((x,i)=>Number(x.id)===k[i]));
let ex=0,far=0;const miss=[];for(const x of o){const d=x.worth-g[x.id];if(d===0)ex++;else miss.push(x.id+':'+g[x.id]+'→'+x.worth+'('+x.why+')');if(Math.abs(d)>1)far++;}
console.log('exact',ex+'/'+o.length,'far(1↔3)',far);console.log(miss.join('\n'));
