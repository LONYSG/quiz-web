import fs from 'node:fs';import {rows,save,compare} from './lib.mjs';
const r=rows(fs.readFileSync('_cache/ko-유엔_회원국.html','utf8')).filter(x=>x.length===2&&/^\d{4}년/.test(x[1]));
const names=[...new Set(r.map(x=>x[0]))];console.log(names.length);
save('country',names,{note:'ko 유엔 회원국 가입 일자 표 — 회원국 193(+옵서버 2는 표 밖)'});
console.log(JSON.stringify(compare('country',names)));
