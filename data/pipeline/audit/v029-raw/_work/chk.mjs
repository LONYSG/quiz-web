import fs from 'node:fs';
const W='C:/work/quiz-web/data/pipeline/audit/v029-raw/_work/';const gold=JSON.parse(fs.readFileSync(W+'anchors.gold.json','utf8'));
const KINDS=['상식','유래','쓸모','개념','취미세부','고유명사','숫자','일화'];
for(const p of process.argv.slice(2)){let o;try{o=JSON.parse(fs.readFileSync(W+p+'.out.json','utf8'));}catch(e){console.log(p,'PARSE FAIL',e.message);continue;}
const k=JSON.parse(fs.readFileSync(W+p+'.keys.json','utf8'));const errs=[];
if(o.length!==k.length)errs.push('len '+o.length+'/'+k.length);
if(!o.every((x,i)=>Number(x.id)===k[i]))errs.push('order');
for(const x of o){if(![1,2,3].includes(x.worth))errs.push('worth '+x.id);if(!KINDS.includes(x.kind))errs.push('kind '+x.id+':'+x.kind);if(!['high','mid','low'].includes(x.confidence))errs.push('conf '+x.id);if(typeof x.why!=='string'||!x.why||x.why.length>30)errs.push('why '+x.id);}
const cal=o.filter(x=>gold[x.id]);const d=cal.filter(x=>x.worth!==gold[x.id]);const far=d.filter(x=>Math.abs(x.worth-gold[x.id])>1);
const c={};for(const x of o)c[x.worth]=(c[x.worth]||0)+1;
console.log(p,o.length,'w',JSON.stringify(c),'anchor miss',d.length+'/'+cal.length,far.length?'FAR '+far.length:'',errs.length?'ERR '+errs.slice(0,6).join(' '):'ok',d.length>3?'RERUN':'');}
