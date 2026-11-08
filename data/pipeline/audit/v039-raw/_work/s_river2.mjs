import fs from 'node:fs';import {rows,lines,save,compare,topic} from './lib.mjs';
const r=rows(fs.readFileSync('_cache/ko-대한민국의_국가하천_목록.html','utf8'));
const nav=[];for(const x of r){if(x.length>=2&&/권역$/.test(x[0])){nav.push(...x[1].split(' ').filter(Boolean));}}
console.log('navbox',nav.length,nav.join(' '));
const tbl=[];for(const x of r.slice(1)){if(x.length>=8)tbl.push(x[2]);else if(x.length>=5&&x.length<8&&x.length!==2&&!/권역|vte/.test(x[0]))tbl.push(x[0]);}
const T=[...new Set(tbl)];console.log('table',T.length);
const U=[...new Set([...nav,...T])];console.log('union',U.length);
console.log('only nav',nav.filter(n=>!T.includes(n)).join(' '),'| only table',T.filter(n=>!nav.includes(n)).join(' '));
const l=lines(fs.readFileSync('_cache/ko-대한민국의_국가하천_목록.html','utf8'));console.log(l.slice(0,6).join('\n').slice(0,800));
save('river-national',U,{navbox:nav,table:T});
const c=compare('river-national',U);console.log(JSON.stringify(c));
