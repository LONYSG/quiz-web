import fs from 'node:fs';const R='C:/work/quiz-web/data/pipeline/audit/v025-raw';const k=process.argv[2];
const o=JSON.parse(fs.readFileSync(`${R}/${k}.out.json`,'utf8'));const r=JSON.parse(fs.readFileSync(`${R}/_work/${k}.refs.json`,'utf8'));
const v={};for(const x of o)v[x.verdict]=(v[x.verdict]||0)+1;const d={};for(const x of o)d[x.score?.dif]=(d[x.score?.dif]||0)+1;
console.log(k,o.length,r.length,o.every((x,i)=>x.ref===r[i]),JSON.stringify(v),JSON.stringify(d));
