import fs from 'node:fs';
const D='data/pipeline/audit/v037-raw/';const R=JSON.parse(fs.readFileSync('data/pipeline/audit/v037-refurb.json','utf8')).items;const T=new Map(JSON.parse(fs.readFileSync(D+'targets.json','utf8')).items.map(i=>[i.id,i]));
const [a,b]=process.argv.slice(2).map(Number);const F=R.filter(x=>x.fix_text).slice(a,b);
const tok=s=>new Set((s.match(/\d+|[가-힣A-Za-z]{2,}/g)||[]).map(w=>w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|입니다|이다)$/,'')));
for(const x of F){const t=T.get(x.id);const q0=tok(t.question_text),q1=tok(x.fix_text);
 const noise=w=>/(니다|까요|습니|했|된|던|는데|으나|하며|이며|하고|하여|이야기|있|않|무엇|누구)/.test(w)||/(다|요|고|며|서|며)$/.test(w);const nw=[...q1].filter(w=>!noise(w)&&!q0.has(w)&&!t.question_text.includes(w)&&w.length>=2);const dr=[...q0].filter(w=>/\d/.test(w)||w.length>=3).filter(w=>!x.fix_text.includes(w)&&(/d/.test(w)||!noise(w)));
 console.log(`${x.id} g${x.grade}${x.hint_refit==='yes'?' REFIT':''}${x.flags?.length?' F:'+x.flags.join(';').slice(0,80):''}\n ${x.fix_text}\n ${nw.length||dr.length?`NEW[${nw.join(' ')}] DROP[${dr.join(' ')}] Q0: ${t.question_text}`:''}`)}
