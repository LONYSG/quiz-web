import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const A='C:/work/quiz-web/data/pipeline/audit'; const J=f=>JSON.parse(fs.readFileSync(f,'utf8')); const one=s=>(s??'').replace(/\s*\n\s*/g,' ').trim();
const t=[];
for(const r of ['g013','g014','g015']){const j=J(`${A}/${r}-decisions.json`).items;for(const [k,d] of Object.entries(j))for(const f of d.factcheck||[])if(f.result==='unverified'&&f.what!=='variant')t.push({round:r,id:Number(k),what:f.what,text:f.text,source:f.source,note:one(f.note),quote:one(f.quote)});}
const c=new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows=(await c.query('select id,question_text,display_answer,explanation,general_hint,difficulty_score d,is_active from questions where id=any($1)',[t.map(x=>x.id)])).rows; await c.end();
const by=Object.fromEntries(rows.map(r=>[Number(r.id),r]));
const g17=fs.existsSync(A+'/g017-fixes.json')?J(A+'/g017-fixes.json'):null;
const items=t.map((x,i)=>({n:i+1,...x,db:{q:one(by[x.id].question_text),a:by[x.id].display_answer,e:one(by[x.id].explanation),h:one(by[x.id].general_hint),active:by[x.id].is_active}}));
fs.writeFileSync('c-items.json',JSON.stringify(items,null,1));
fs.writeFileSync('c.txt',`## unverified 문장 ${items.length}건 (g013~g015 decisions factcheck — 질문·해설·힌트에 남긴 문장; 번호 = 입력 순서)\n\n`+items.map(x=>`### C${String(x.n).padStart(2,'0')}  #${x.id}  [${x.round} · ${x.what}]\nQ: ${x.db.q}\nA: ${x.db.a}\nE: ${x.db.e}\nH: ${x.db.h||'(없음)'}\n미확인 문장: «${x.text}»\n지난번 확인 출처(못 닫음): ${x.source||'(없음)'}\n지난번 메모: ${x.note}\n`).join('\n'));
console.log(items.length, g17?Object.keys(g17):'no g017-fixes');
