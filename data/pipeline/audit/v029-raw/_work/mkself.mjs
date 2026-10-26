import fs from 'node:fs';
import {block} from './mkblocks.mjs';
const A=JSON.parse(fs.readFileSync('anchors60.json','utf8')).filter(a=>!a.ex);
let seed=29;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
const t=[...A];for(let i=t.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[t[i],t[j]]=[t[j],t[i]];}
const W='C:/work/quiz-web/data/pipeline/audit/v029-raw/_work/';const name=process.argv[2]||'s1';
fs.writeFileSync(W+name+'.txt',t.map(a=>block(a.id)).join('\n'));
fs.writeFileSync(W+name+'.keys.json',JSON.stringify(t.map(a=>a.id)));
fs.writeFileSync(W+name+'.gold.json',JSON.stringify(Object.fromEntries(t.map(a=>[a.id,a.worth]))));
console.log(t.length);
