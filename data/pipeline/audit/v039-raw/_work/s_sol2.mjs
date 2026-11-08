import fs from 'node:fs';import {lines,rows,topic} from './lib.mjs';import {cover} from './cover.mjs';
const h=fs.readFileSync('_cache/ko-중력적으로_둥근_태양계_천체_목록.html','utf8');
const r=rows(h);console.log(r.length);console.log(r.slice(0,40).map(x=>x.slice(0,3).join(' ; ').slice(0,100)).join('\n'));
const txt=lines(h).join(' ');const c=cover('solar-system',txt,{useVariants:true});console.log('extra',JSON.stringify(c.extra));
