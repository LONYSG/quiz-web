import fs from 'node:fs';import {normalizeAnswer} from '../../../../../shared/dist/index.js';
const D='data/pipeline/audit/v037-raw/';const T=new Map(JSON.parse(fs.readFileSync(D+'targets.json','utf8')).items.map(i=>[i.id,i]));
const files=process.argv.slice(2).length?process.argv.slice(2):fs.readdirSync(D+'out').filter(f=>/^p\d\d-B\.json$/.test(f)).map(f=>f.slice(0,3));
const keys=['ask_ok','read_final','subj','comp','fix_text','hint_refit','worth_v','flags','verdict'];
const sents=t=>t.split(/(?<=[.?!])\s+/).filter(Boolean);const bad=[];let n=0;
for(const p of files){const A=JSON.parse(fs.readFileSync(D+`out/${p}-A.json`));const B=JSON.parse(fs.readFileSync(D+`out/${p}-B.json`));
 if(A.length!==B.length)bad.push([p,'건수',A.length,B.length]);
 B.forEach(b=>{n++;const t=T.get(String(b.id));if(!t){bad.push([p,b.id,'ID 없음']);return}
  for(const k of keys)if(!(k in b))bad.push([p,b.id,'키 '+k]);
  if(b.fix_text){const f=b.fix_text;const len=[...f].length;const ss=sents(f);
   if(len>240)bad.push([p,b.id,'240초과',len]);
   const lg=ss.filter(s=>[...s].length>70);if(lg.length)bad.push([p,b.id,'70초과 문장',lg.map(s=>[...s].length).join()]);
   if(ss.length<2||ss.length>4)bad.push([p,b.id,'문장수',ss.length]);
   const nf=normalizeAnswer(f);for(const a of [t.display_answer,...(t.variants||[])]){const na=normalizeAnswer(a);if(na&&na.length>=2&&nf.includes(na))bad.push([p,b.id,'정답/변형 누설',a])}
   const tn=normalizeAnswer(t.question_text),ex=(t.explanation||'').match(/[A-Z][A-Za-z]+|\d{3,}|[가-힣]{3,}/g)||[];
   const nw=[...new Set(ex)].filter(w=>f.includes(w)&&!t.question_text.includes(w));if(nw.length>3)bad.push([p,b.id,'경고:해설어 유입',nw.slice(0,6).join('/')]);
  }else if(b.verdict==='fix'&&b.read_final==='a'&&b.subj==='ok'&&b.comp==='ok')bad.push([p,b.id,'경고:fix인데 질문고침 없음(다른 사유?)']);
 })}
console.log('검사',n,'문항 · 이슈',bad.length);for(const b of bad)console.log(b.join(' | '));
