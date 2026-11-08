import fs from 'node:fs';import {rows,save,compare,topic} from './lib.mjs';
let r=rows(fs.readFileSync('_cache/ko-원소_목록.html','utf8')).filter(x=>/^\d+$/.test(x[0])&&x.length>5);
let names=r.map(x=>[x[2],x[3]]);console.log('element',names.length);save('element',names,{note:'ko 원소 목록 표 Z 1~118'});
console.log(JSON.stringify(compare('element',names)));
r=rows(fs.readFileSync('_cache/ko-대한민국의_국가하천_목록.html','utf8'));
const rv=[];for(const x of r.slice(1)){if(x.length>=8)rv.push(x[2]);else if(x.length>=5&&x.length<8&&/하천|강|천|내|구거|수로/.test(x[0]))rv.push(x[0]);}
console.log('river rows',rv.length, rv.slice(0,5), r.filter(x=>x.length<5).slice(0,5));
const uniq=[...new Set(rv)];console.log(uniq.length);save('river-national',uniq,{note:'ko 국가하천 목록 표(명칭 열)'});
console.log(JSON.stringify(compare('river-national',uniq)));
