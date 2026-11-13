// 설계 도구 — 묶음 하나에 "정답이 같은 다른 문항"을 붙인다 (지금 DB 값 · 읽기만)
//   node web-desk/tone/_mk_same.mjs 005      → 보낼것/같은정답-005.txt
import pg from 'pg';import fs from 'node:fs';
const nn=process.argv[2];const dir='web-desk/tone/';
const ids=JSON.parse(fs.readFileSync(dir+'_카드-순서.json','utf8')).find(x=>x.file==='카드-'+nn).ids.map(String);
const c=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await c.connect();
const rows=(await c.query(`select id,question_text q,display_answer a,general_hint h,lower(regexp_replace(display_answer,'\s','','g')) k from questions where is_active and question_text not like '%이모지가 나타내는%'`)).rows;await c.end();
const by={};for(const r of rows)(by[r.k]??=[]).push(r);
let t=`# 같은정답-${nn} — 이 묶음의 문항과 정답이 같은 다른 활성 문항(지금 DB 값). 없는 id 는 겹치는 문항이 없다.\n`;let n=0;
for(const id of ids){const me=rows.find(r=>String(r.id)===id);if(!me)continue;const o=by[me.k].filter(r=>String(r.id)!==id);if(!o.length)continue;n++;
  t+=`\n[${id}] 정답: ${me.a}\n`;for(const r of o)t+=`  · #${r.id}${ids.includes(String(r.id))?' (같은 묶음)':''}\n    질문: ${r.q.replace(/\s+/g,' ')}\n    힌트: ${(r.h||'').replace(/\s+/g,' ')}\n`}
fs.writeFileSync(`${dir}보낼것/같은정답-${nn}.txt`,t);console.log(nn,'겹치는 문항',n);
