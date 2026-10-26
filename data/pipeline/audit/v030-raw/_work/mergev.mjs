import fs from 'node:fs';import {W,T,vblock,groupBy} from './vblocks.mjs';
const pre=JSON.parse(fs.readFileSync('pre.json','utf8'));
const m={};let dup=0;
const files=fs.readdirSync('.').filter(f=>/^v\d\d\.out\.json$/.test(f)||f==='vR.out.json').sort();
for(const f of files){const p=f.slice(0,-9);for(const x of JSON.parse(fs.readFileSync(f,'utf8'))){const k=x.id+'|'+x.v;if(m[k])dup++;m[k]={...x,piece:p};}}
const miss=pre.keep.filter(c=>!m[c.id+'|'+c.v]);
console.log('judged',Object.keys(m).length,'keep',pre.keep.length,'missing',miss.length,'dup',dup);
fs.writeFileSync('vmerged.json',JSON.stringify(m));
if(miss.length&&!fs.existsSync('vR.txt')){const gs=groupBy(miss);fs.writeFileSync('vR.txt',gs.map(vblock).join('\n'));fs.writeFileSync('vR.keys.json',JSON.stringify(gs.flatMap(g=>g.cands.map(c=>({id:g.id,v:c.v})))));console.log('vR written',gs.length);}
