import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows=(await c.query("select id, question_text q, explanation e, general_hint h, display_answer a from questions where is_active order by id")).rows; await c.end();
const one=s=>(s??'').replace(/\s*\n\s*/g,' ').trim();
const re=/(특별시|광역시|특별자치|특례시|통합|광주|전남|전라남도|나주|목포|여수|순천|광양|담양|대전|충남|충청남도|대구|경북|경상북도|세종|행정구역|직할시|시·도)/;
const sel=rows.filter(r=>re.test(`${r.q} ${r.e||''} ${r.h||''} ${r.a||''}`));
fs.writeFileSync('d-input.txt',`## 행정 구역 후보 ${sel.length}건 (활성 ${rows.length} 중 기계 검색: 특별시·광역시·특별자치·통합·광주·전남·나주·목포·여수·순천·광양·담양·대전·충남·대구·경북·세종·행정구역 등 낱말이 질문·해설·힌트·정답 어디든 든 문항)\n\n`+sel.map(r=>`#${r.id} A:${one(r.a)} | Q:${one(r.q)} | E:${one(r.e)} | H:${one(r.h)||'-'}`).join('\n')+'\n');
console.log(sel.length, rows.length);
