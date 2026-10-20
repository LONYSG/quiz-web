import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows=(await c.query("select id, question_text q, explanation e, general_hint h, display_answer a, difficulty_score d from questions where is_active")).rows; await c.end();
console.log('active',rows.length);
const pats={
 metro:/특별시|광역시|특별자치시|특별자치도|특례시|전남광주|광주광역시|대전충남|충남대전|대구경북|부산경남|통합특별시|행정\s?통합|행정\s?구역|행정구역|시·도|시도\s?통합|광역자치/,
 change:/통합|폐지|승격|신설|개편|분리|합병|편입|개칭|이전/,
 prov:/(경기|강원|충청[남북]?|충[남북]|전라[남북]?|전[남북]|경상[남북]?|경[남북]|제주)(특별자치)?도/,
 city:/(서울|부산|대구|인천|광주|대전|울산|세종)(특별|광역)?(자치)?시?/,
 count:/광역시\s?(는|가)?\s?(여섯|6|일곱|7)|시·도|17개|특별시\s?\S*\s?광역시/,
};
const out=[];
for(const r of rows){const txt=`${r.q} ${r.e||''} ${r.h||''}`; const m={};let any=false;
 for(const [k,re] of Object.entries(pats)){ if(k==='city'||k==='prov'||k==='change') continue; const x=txt.match(re); if(x){m[k]=x[0];any=true;} }
 if(any) out.push({id:Number(r.id),d:r.d,a:r.a,q:r.q,e:r.e,h:r.h,m});}
fs.writeFileSync('d-cand1.json',JSON.stringify(out,null,1));
console.log('metro-ish candidates',out.length);
// 지명·행정 구역 단어가 정답인 문항 / 질문에 도·시 이름 + 현재형 서술
const re2=/(광역시|특별시|특별자치(시|도)|통합특별시|광주|전남|전라남도|나주|목포|여수|순천|대전|충남|충청남도|세종|대구|경북|경상북도|부산|경남|울산|제주도|강원특별자치도|전북특별자치도|전라북도)/;
const c2=rows.filter(r=>re2.test(`${r.q} ${r.e||''} ${r.h||''}`)).map(r=>r.id);
console.log('broad(지역 이름 포함)',c2.length);
fs.writeFileSync('d-broad.json',JSON.stringify(c2));
