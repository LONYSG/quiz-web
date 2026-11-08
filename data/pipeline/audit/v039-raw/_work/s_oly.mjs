import fs from 'node:fs';import {lines,save,topic} from './lib.mjs';import {cover} from './cover.mjs';
const L=lines(fs.readFileSync('_cache/ko-2024년_하계_올림픽.html','utf8'));
const txt=L.join(' ');
const c=cover('olympic-summer-sport',txt,{useVariants:false});console.log(JSON.stringify(c.extra));
const c2=cover('olympic-summer-sport',txt,{useVariants:true});console.log(JSON.stringify(c2.extra));
// find the sports table(s): lines containing 종목 number 32
console.log(L.filter(l=>/32개|종목 수|세부 종목/.test(l)).slice(0,8).join('\n').slice(0,900));
