import fs from 'node:fs';import {rows,save,topic} from './lib.mjs';
const r=rows(fs.readFileSync('_cache/en-List_of_Walt_Disney_Animation_Studios_films.html','utf8')).filter(x=>x.length>=3&&/^[A-Z][a-z]+ \d{1,2}, \d{4}/.test(x[1]));
const en=r.map(x=>[x[0].replace(/\[.*?\]/g,''),x[1].match(/\d{4}/)[0]]);console.log(en.length);
const f=topic('disney-animated-film').items;
const n=Math.max(en.length,f.length);const out=[];for(let i=0;i<n;i++)out.push(`${i+1}. ${en[i]?.join(' ')||'-'}  ||  ${f[i]?.name||'-'} ${f[i]?.year||''}${en[i]&&f[i]&&en[i][1]!==String(f[i].year)?'  <<YEAR':''}`);
console.log(out.join('\n'));save('disney-animated-film',en.map(e=>e[0]),{years:en.map(e=>e[1]),page2:'en wiki List of WDAS films (64) + ko 디즈니의 장편 애니메이션 영화 목록(2022까지)'});
