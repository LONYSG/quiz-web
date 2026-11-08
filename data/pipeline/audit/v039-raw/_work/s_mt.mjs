import fs from 'node:fs';import {rows,topic,canon,save,compare} from './lib.mjs';
const r=rows(fs.readFileSync('_cache/ko-대한민국_100대_명산_목록.html','utf8')).filter(x=>/^\d+$/.test(x[0])&&x.length>=4);
const names=r.map(x=>x[1].replace(/\(.*?\)/g,'').trim());console.log(names.length);
// file names may carry region prefix ("포천 백운산"); match by canon of full, or by page name w/ region
const t=topic('mountain-100');
const regions=r.map(x=>x[3]);
const fileCanon=t.items.map(i=>({it:i,c:canon(i.name),vs:(i.variants||[]).map(canon)}));
const used=new Set(),miss=[];
r.forEach((x,k)=>{const n=canon(x[1].replace(/\(.*?\)/g,''));let cands=fileCanon.filter(f=>f.c===n||f.vs.includes(n));
  if(!cands.length)cands=fileCanon.filter(f=>f.c.endsWith(n)&&!used.has(f.it.id));
  if(cands.length){used.add(cands[0].it.id);}else miss.push(`${x[0]}:${x[1]} (${x[3].slice(0,18)})`);});
console.log('page unmatched',miss.length,miss.join(' | '));
console.log('file unmatched',t.items.filter(i=>!used.has(i.id)).map(i=>i.name).join(', '));
// page dup names
const cnt={};names.forEach(n=>cnt[n]=(cnt[n]||0)+1);console.log('dup in page',Object.entries(cnt).filter(([,v])=>v>1).map(([k])=>k).join(','));
save('mountain-100',names,{regions});
