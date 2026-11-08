import fs from 'node:fs';import {lines,rows,topic,canon} from './lib.mjs';import {cover} from './cover.mjs';
const h=fs.readFileSync('_cache/ko-성경.html','utf8');
const txt=lines(h).join(' ');
console.log(txt.length, /창세기/.test(txt), /요한 계시록|요한계시록|요한묵시록/.test(txt));
const c=cover('bible-book',txt,{useVariants:false});console.log(JSON.stringify(c.extra));console.log(c.leftover.join('|').slice(0,500));
