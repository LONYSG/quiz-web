import fs from 'node:fs';import {page} from './lib.mjs';
const T=[['ko','나라 이름순 수도 목록'],['ko','국제천문연맹 지정 별자리'],['ko','성경'],['ko','디즈니의 장편 애니메이션 영화 목록'],['ko','스튜디오 지브리'],['ko','태양계'],['ko','대한민국의 기초자치단체 목록'],['ko','서울 지하철 6호선'],['ko','서울 지하철 7호선'],['ko','서울 지하철 8호선'],['ko','서울 지하철 9호선'],['ko','대한민국 100대 명산 목록'],['ko','KBO 리그']];
for(const [l,t] of T){const f=`_cache/${l}-${t.replace(/\s/g,'_')}.html`;if(fs.existsSync(f))continue;try{fs.writeFileSync(f,await page(l,t));console.log('ok',l,t,fs.statSync(f).size);}catch(e){console.log('FAIL',l,t);}await new Promise(s=>setTimeout(s,3500));}
