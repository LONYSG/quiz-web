import fs from 'node:fs';import {rows,topic,canon,save} from './lib.mjs';
const all=[];
for(let n=1;n<=9;n++){const r=rows(fs.readFileSync(`_cache/ko-서울_지하철_${n}호선.html`,'utf8'));
  let cur=0;for(const x of r){if(x.length>=5&&/^[A-Z]?\d{2,4}(-\d)?$/.test(x[0])&&/^[A-Za-z]/.test(x[2]||'')&&!/^\d/.test(x[1])){const name=x[1].replace(/\(.*?\)/g,'').replace(/역$/,'').trim();const region=x.slice(3).filter(c=>/특별시|광역시|경기도|서울|인천|시$|구$|군$/.test(c)).join('/');all.push({line:n,code:x[0],name,raw:x[1],region});}}}
console.log('station rows',all.length);
const byLine={};for(const a of all)byLine[a.line]=(byLine[a.line]||0)+1;console.log(JSON.stringify(byLine));
const t=topic('seoul-subway-station');const map=new Map();for(const it of t.items){map.set(canon(it.name),it);for(const v of it.variants||[])if(!map.has(canon(v)))map.set(canon(v),it);}
const names=new Map();for(const a of all){const k=canon(a.name);if(!names.has(k))names.set(k,{...a,lines:new Set()});names.get(k).lines.add(a.line);}
const used=new Set();const miss=[];
for(const [k,a] of names){const it=map.get(k);if(it)used.add(it.id);else miss.push(`${a.name}(${[...a.lines].join(',')};${a.region||'?'})`);}
console.log('unique page names',names.size,'matched file',used.size);
console.log('page not in file',miss.length);console.log(miss.join(' '));
console.log('file not on page',t.items.filter(i=>!used.has(i.id)).map(i=>i.id+':'+i.name).join(', '));
save('seoul-subway-station',[...names.values()].map(a=>a.name),{rows:all.length,byLine});
