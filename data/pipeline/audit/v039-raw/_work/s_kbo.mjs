import fs from 'node:fs';import {lines,rows,topic} from './lib.mjs';import {cover} from './cover.mjs';
const h=fs.readFileSync('_cache/ko-KBO_리그.html','utf8');const L=lines(h);const txt=L.join(' ');
const c=cover('kbo-team',txt,{useVariants:false});console.log('extra(no var)',JSON.stringify(c.extra));
const c2=cover('kbo-team',txt,{useVariants:true});console.log('extra(var)',JSON.stringify(c2.extra));
for(const k of ['쌍방울','현대 유니콘스','삼미','청보','태평양','히어로즈','해체']){const i=txt.indexOf(k);console.log(k,i>=0?txt.slice(Math.max(0,i-50),i+80):'-')}
