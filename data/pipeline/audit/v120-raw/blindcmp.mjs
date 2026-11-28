import fs from 'node:fs';
import { normalizeAnswer } from '../../../../shared/dist/index.js';
const R='C:/work/quiz-web/web-desk/tone/';
const sent=new Map();for(let i=1;i<=8;i++)JSON.parse(fs.readFileSync(`${R}보낼것/기존-고침-01-p0${i}.json`,'utf8')).items.forEach(x=>sent.set(String(x.key),x));
const got=new Map();for(let i=1;i<=8;i++)JSON.parse(fs.readFileSync(`${R}받은것/기존-고침-01-p0${i}.json`,'utf8')).cards.forEach(x=>got.set(String(x.key),x));
const out=[];
for(const g of ['g01','g02']){const meta=JSON.parse(fs.readFileSync(g+'.meta.json','utf8'));const bl=new Map(JSON.parse(fs.readFileSync(g+'.blind.out.json','utf8')).map(r=>[r.key,r.answer]));
 for(const c of meta.cards){const s=sent.get(c.card).card;const acc=[s.answer,...(s.also??[])].map(normalizeAnswer);const given=bl.get(c.key);const n=normalizeAnswer(given??'');
  out.push({key:c.card,bkey:c.key,answer:s.answer,also:s.also,given,exact:acc.includes(n),q:got.get(c.card).question});}}
fs.writeFileSync('blind-raw.json',JSON.stringify(out));
const miss=out.filter(o=>!o.exact);console.log(out.length,'exact',out.length-miss.length);
fs.writeFileSync('blind-other.txt',miss.map(o=>`### ${o.key}\n질문: ${o.q}\n정답(인정 답): ${o.answer}${o.also?.length?' ('+o.also.join(' / ')+')':''}\n블라인드 답: ${o.given}\n`).join('\n'));
miss.forEach(o=>console.log(o.key,'|',o.answer,'|',o.given));
