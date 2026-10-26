import fs from 'node:fs';import {T} from './vblocks.mjs';
const U=JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/g023-lists.json','utf8')).unique;
const m={};for(let i=1;i<=13;i++){const n='u'+String(i).padStart(2,'0');for(const x of JSON.parse(fs.readFileSync(n+'.out.json','utf8')))m[x.id]={...x,piece:n};}
const miss=U.filter(u=>!m[u.id]).map(u=>u.id);console.log('merged',Object.keys(m).length,'missing',miss);
fs.writeFileSync('uniq.merged.json',JSON.stringify(m));
const c={};for(const x of Object.values(m))c[x.verdict]=(c[x.verdict]||0)+1;console.log(c);
