import fs from 'node:fs';import {lines,topic,canon,save} from './lib.mjs';
const L=lines(fs.readFileSync('_cache/ko-나라_이름순_수도_목록.html','utf8')).filter(l=>/ - /.test(l));
console.log('page lines',L.length);
const t=topic('world-capital');const map=new Map();for(const it of t.items){map.set(canon(it.name),it);for(const v of it.variants||[])map.set(canon(v),it);}
const used=new Set();const unm=[];const viaV=[];
for(const l of L){const [c,...rest]=l.split(' - ');const cap=rest.join(' - ');
  const alts=cap.split(/[,\/·]/).map(s=>s.replace(/\(.*?\)/g,'').trim()).filter(Boolean);
  let hit=null,which=null;for(const a of alts){if(map.has(canon(a))){hit=map.get(canon(a));which=a;break;}}
  if(hit){used.add(hit.id);if(canon(hit.name)!==canon(which))viaV.push(`${c}: page ${which} -> file ${hit.name}`);}else unm.push(l);}
console.log('unmatched page lines',unm.length);console.log(unm.join('\n'));
console.log('file items not matched',t.items.filter(i=>!used.has(i.id)).map(i=>i.id+':'+i.name).join(', '));
console.log('viaVariant',viaV.length,viaV.join(' | '));
