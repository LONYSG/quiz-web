import {page,rows,lines,save,compare} from './lib.mjs';
// seoul-gu
let h=await page('ko','서울특별시의 행정 구역');
let names=rows(h).map(r=>r[0]).filter(x=>/^[가-힣]{1,5}구$/.test(x));
names=[...new Set(names)];save('seoul-gu',names);console.log('seoul-gu',names.length,JSON.stringify(compare('seoul-gu',names)));
// joseon-king
h=await page('ko','조선의 국왕');
console.log(rows(h).filter(r=>r.length>2).slice(0,45).map(r=>r.slice(0,4).join(' ; ')).join('\n'));
