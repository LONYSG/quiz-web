import fs from 'node:fs';import {lines,rows,topic} from './lib.mjs';import {cover} from './cover.mjs';
const h=fs.readFileSync('_cache/ko-태양계.html','utf8');const txt=lines(h).join(' ');
const c=cover('solar-system',txt,{useVariants:false});console.log('extra(no variants)',JSON.stringify(c.extra));
const c2=cover('solar-system',txt,{useVariants:true});console.log('extra(variants)',JSON.stringify(c2.extra));
// moons mentioned in page text: which famous moons exist in page but not in file
const t=topic('solar-system');const names=t.items.map(i=>i.name);
for(const k of ['트리톤','카론','히페리온','프로메테우스','판','아말테아','포이베','네레이드','디모스','프로테우스','퍼크','세이코락스','칼리스토']){console.log(k,txt.includes(k)?'page+':'page-',names.includes(k)?'file+':'file-')}
