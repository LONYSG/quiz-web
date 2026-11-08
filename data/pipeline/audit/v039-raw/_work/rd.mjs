import fs from 'node:fs';import {rows,lines} from './lib.mjs';
const f=process.argv[2];const h=fs.readFileSync('_cache/'+f,'utf8');
const mode=process.argv[3]||'rows';const a=+process.argv[4]||0,b=+process.argv[5]||25;
if(mode==='rows'){const r=rows(h);console.log('rows',r.length);console.log(r.slice(a,b).map((x,i)=>(a+i)+': '+x.join(' ; ').slice(0,200)).join('\n'));}
else {const l=lines(h);console.log('lines',l.length);console.log(l.slice(a,b).map((x,i)=>(a+i)+': '+x.slice(0,200)).join('\n'));}
