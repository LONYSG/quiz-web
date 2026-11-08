import fs from 'node:fs';import {rows,topic,canon,save} from './lib.mjs';
const r=rows(fs.readFileSync('_cache/ko-ISO_4217.html','utf8')).filter(x=>/^[A-Z]{3}$/.test(x[0])&&x.length>=4&&/^\d{3}$/.test(x[1]));
console.log('iso rows',r.length);
const t=topic('currency');
const txt=canon(t.items.map(i=>i.name+' '+(i.variants||[]).join(' ')).join(' '));
const missing=[];const units={};
for(const x of r){const nm=x[3].replace(/\(.*?\)/g,'').trim();const toks=nm.split(' ');const unit=toks[toks.length-1];
  const code=x[0];if(/^X/.test(code)||/^(CHE|CHW|COU|MXV|USN|UYI|UYW|BOV|CLF)$/.test(code))continue;
  units[unit]=(units[unit]||[]);units[unit].push(nm);
  const u=canon(unit);const full=canon(nm);
  if(!(txt.includes(u)||txt.includes(full)))missing.push(`${code} ${nm}`);}
console.log('missing',missing.length,missing.join(' | '));
console.log('names in file',t.items.length);
save('currency',r.map(x=>x[3]),{codes:r.map(x=>x[0])});
