import fs from 'node:fs';import {rows,save} from './lib.mjs';import {cover} from './cover.mjs';
const r=rows(fs.readFileSync('_cache/ko-마블_시네마틱_유니버스의_영화_목록.html','utf8'));
const phase=r.filter(x=>/^페이즈 [1-6]$/.test(x[0])&&x.length===2&&!/완다비전|시크릿 인베/.test(x[1])||(x[0]==='영화'));
const txt=r.slice(15,21).map(x=>x[x.length-1]).join(' ');
const c=cover('mcu-film',txt,{useVariants:false});console.log(JSON.stringify(c));
save('mcu-film',[],{text:txt});
// ghibli
const g=rows(fs.readFileSync('_cache/ko-스튜디오_지브리.html','utf8'));const gt=g[19].join(' ');
const c2=cover('ghibli-film',gt,{useVariants:false});console.log(JSON.stringify(c2));save('ghibli-film',[],{text:gt});
