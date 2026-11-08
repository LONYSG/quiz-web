// node unlock.mjs pNN — A 결과가 저장된 뒤에만 B 를 만든다(저장 시각 기록)
import fs from 'node:fs';
const D='data/pipeline/audit/v037-raw/';const p=process.argv[2];
const af=D+`out/${p}-A.json`;if(!fs.existsSync(af)){console.error('A 결과 없음 — 먼저 '+af+' 를 저장하라');process.exit(1)}
const A=JSON.parse(fs.readFileSync(af,'utf8'));const inA=JSON.parse(fs.readFileSync(D+`in/${p}-A.json`,'utf8'));
const need=['id','ask','guess','read','read_why'];const miss=[];
if(A.length!==inA.length)miss.push(`건수 ${A.length}/${inA.length}`);
inA.forEach((x,i)=>{const a=A[i];if(!a||String(a.id)!==x.id){miss.push('순서/ID '+x.id);return}for(const k of need)if(a[k]==null||a[k]==='')miss.push(x.id+' '+k)});
if(miss.length){console.error('A 불완전:',miss.slice(0,10).join(' | '));process.exit(1)}
const piece=+p.slice(1);const T=JSON.parse(fs.readFileSync(D+'targets.json','utf8')).items.filter(i=>i.piece===piece);
const B=T.map(i=>({id:i.id,question_text:i.question_text,display_answer:i.display_answer,variants:i.variants||[],general_hint:i.general_hint,explanation:i.explanation,grade:i.grade,category:i.l2,worth_stored:i.worth}));
fs.writeFileSync(D+`in/${p}-B.json`,JSON.stringify(B,null,1));
fs.writeFileSync(D+`out/${p}.stamp.json`,JSON.stringify({aSaved:fs.statSync(af).mtime.toISOString(),bUnlocked:new Date().toISOString()}));
console.log('B 열림:',D+`in/${p}-B.json`,B.length);
