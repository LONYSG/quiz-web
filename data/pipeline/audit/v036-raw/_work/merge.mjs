import fs from 'node:fs';
const D='data/pipeline/audit/v036-raw/';
const T=JSON.parse(fs.readFileSync(D+'targets-g032-484.json','utf8')).items;const m=Object.fromEntries(T.map(i=>[i.id,i]));
let all=[];for(let p=1;p<=10;p++){const n=String(p).padStart(2,'0');all.push(...JSON.parse(fs.readFileSync(D+`out/g032-p${n}.json`,'utf8')).map(r=>({...r,piece:p})))}
const out=all.map(r=>{const t=m[String(r.id)];return {id:String(r.id),answer:t.answer,why:'V036 전수',piece:r.piece,scoreV4:t._score.dif,gradeIndep:r.grade_v,worthStored:t._score.worth,worthIndep:r.worth_v,...r,reread:'조각만'}});
fs.writeFileSync(D+'merged-raw.json',JSON.stringify(out,null,1));
console.log(out.length,new Set(out.map(o=>o.id)).size);
const c={};out.forEach(o=>c[o.verdict]=(c[o.verdict]||0)+1);console.log(c);
const f={};out.forEach(o=>f[o.fact]=(f[o.fact]||0)+1);console.log('fact',f);
console.log('false',out.filter(o=>o.fact==='false').map(o=>o.id).join(','));
console.log('hintfix',out.filter(o=>o.hint==='fix').length,'readRewrite',out.filter(o=>o.read==='rewrite').length,'uniqueFalse',out.filter(o=>o.unique_ok===false).map(o=>o.id).join(','));
console.log('webfetch',out.reduce((a,o)=>a+(o.fact_web||0),0));
