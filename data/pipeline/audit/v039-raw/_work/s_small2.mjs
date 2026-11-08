import {page,rows,lines,save,compare} from './lib.mjs';
let h=await page('ko','서울특별시의 행정 구역');
let names=[...new Set(rows(h).map(r=>r[0]).filter(x=>/^[가-힣]{1,5}구$/.test(x)&&x!=='자치구'))];save('seoul-gu',names);console.log('seoul-gu',names.length,JSON.stringify(compare('seoul-gu',names)));
h=await page('ko','조선의 국왕');
const L=lines(h);console.log(L.filter(l=>/순종/.test(l)).slice(0,5).join('\n'));
names=rows(h).filter(r=>/^제\d+대$/.test(r[0])).map(r=>r[1].split(' / ')[0]);
console.log(names.length);save('joseon-king',names,{note:'ko wiki 조선의 국왕 표: 제1~26대(고종까지). 순종은 대한제국 황제(표 밖)'});
console.log(JSON.stringify(compare('joseon-king',names)));
// president
h=await page('ko','대한민국의 대통령 목록');
console.log(rows(h).filter(r=>r.length>2).slice(0,40).map(r=>r.slice(0,3).join(' ; ').slice(0,120)).join('\n'));
