import fs from 'node:fs';import {lines,topic} from './lib.mjs';
const L=lines(fs.readFileSync('_cache/ko-나라_이름순_수도_목록.html','utf8'));
console.log(L.filter(l=>/^(인도네시아|팔라우|부탄|몽골|투르크|안도라|대한민국) /.test(l)).join('\n'));
const t=topic('world-capital');console.log(t.items.filter(i=>['063','076','084','093','103','149'].some(k=>i.id.endsWith(k))||/팀/.test(i.name)).map(i=>i.id+' '+i.name+JSON.stringify(i.variants)+' '+(i.note||'')).join('\n'));
