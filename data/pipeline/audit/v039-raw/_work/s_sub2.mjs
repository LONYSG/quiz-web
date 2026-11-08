import fs from 'node:fs';import {rows,topic,canon,save} from './lib.mjs';
const nav={};
for(let n=1;n<=9;n++){const r=rows(fs.readFileSync(`_cache/ko-서울_지하철_${n}호선.html`,'utf8'));
  for(const x of r){if(x[0]===`서울 지하철 ${n}호선`&&x[1]&&x[1].startsWith('-')){nav[n]=(nav[n]||[]);nav[n].push(x[1].split(' - ').map(s=>s.replace(/^-\s*/,'').replace(/\(.*?\)/g,'').replace(/역$/,'').trim()).filter(Boolean));}
  }}
for(const n in nav)console.log(n,nav[n].map(a=>a.length).join(','),nav[n].map(a=>a.slice(0,2).join('>')+'...'+a.slice(-2).join('>')).join(' || '));
fs.writeFileSync('_work/subnav.json',JSON.stringify(nav));
