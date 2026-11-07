import fs from 'node:fs';
const T=JSON.parse(fs.readFileSync('targets-g032.json','utf8')).items;const m=Object.fromEntries(T.map(i=>[i.id,i]));
let all=[];for(let p=1;p<=4;p++)all.push(...JSON.parse(fs.readFileSync(`out/g032-p${p}.json`,'utf8')).map(r=>({...r,piece:p})));
const reread=new Set([6914,6956,7097,7406,6997,7427,7304,7453,7102,7246,7389,7451,7206,6895,7143,7071,7036,7445,7210,7281,7324,7174,7231,6906,7023,6911,7044,7386,7367,7139,7152,7342,6873,7067,6924,7178,6850,6851,6972]);
const out=all.map(r=>{const t=m[r.id];const o={id:r.id,answer:t.answer,why:t.why,piece:r.piece,scoreV4:t._score.dif,gradeIndep:r.grade_v,worthStored:t._score.worth,worthIndep:r.worth_v,...r};delete o.piece2;
 o.reread=reread.has(Number(r.id))?'VERIFY 재독':'조각만';return o});
// VERIFY adjustments
const adj=(id,f)=>{const o=out.find(x=>String(x.id)===String(id));f(o)};
adj(7386,o=>{o.verdict='fix';o.verdict_why='힌트·질문 사실 true(en 위키 · RIAA 1976 골드 50만) · 해설 "진공 금속 입힌 비닐" 은 못 닫음 → 해설 삭제(VERIFY 재독)';o.fact_fix='해설 삭제 또는 출처 확인 뒤 사용'});
adj(7044,o=>{o.verdict='fix';o.verdict_why='en 위키 Convention bounce: 1992 클린턴 "as many as 30 points" 이나 기관별 16~24 갈림 — 단정 완화 (VERIFY 재독 동의)'});
fs.writeFileSync('../v035-g032.json',JSON.stringify({round:'V035',at:new Date().toISOString(),n:out.length,items:out},null,1));
const c={};out.forEach(o=>c[o.verdict]=(c[o.verdict]||0)+1);console.log(c,'reread',out.filter(o=>o.reread!=='조각만').length);
const heavy=out.filter(o=>o.verdict!=='keep'&&(o.read==='rewrite'||o.hint==='fix'||(o.fact_fix&&!/^해설/.test(o.fact_fix))||o.verdict==='drop'));console.log('질문·힌트 손질 union',heavy.length);
const fq=out.filter(o=>o.fact==='false').map(o=>o.id);console.log('false',fq.join(','));
const expl=out.filter(o=>o.verdict==='fix'&&!heavy.includes(o));console.log('해설·변형만',expl.length);
