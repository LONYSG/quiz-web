import fs from 'node:fs';const W='C:/work/quiz-web/data/pipeline/audit/v017-raw/_work/';const k=process.argv[2];
const refs=JSON.parse(fs.readFileSync(W+k+'.refs.json','utf8'));let out=JSON.parse(fs.readFileSync(W+k+'.out.json','utf8'));
const isWp=k.startsWith('wp-');const arr=isWp?out.rows:out;const key=x=>isWp?x.key:x.id;
const v={};for(const x of arr)v[x.verdict]=(v[x.verdict]||0)+1;
const imgs=arr.flatMap(x=>x.images||[]);if(isWp&&out.image)imgs.push(out.image);
const bad=imgs.filter(i=>i.verdict!=='ok').length;
const urls=arr.reduce((s,x)=>s+(x.urls?.length||0),0);
console.log(k,arr.length,refs.length,arr.length===refs.length&&arr.every((x,i)=>key(x)===refs[i]),JSON.stringify(v),'imgs',imgs.length,'imgBad',bad,'urls',urls,isWp?'fx '+(out.fxChecks||[]).length:'');
