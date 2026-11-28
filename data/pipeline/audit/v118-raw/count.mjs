import fs from 'node:fs';
import pg from 'pg';
const A='data/pipeline/audit/', P='data/pipeline/tone/', T='web-desk/tone/';
const read=(p)=>{try{return JSON.parse(fs.readFileSync(p,'utf8').replace(/^﻿/,''))}catch{return null}};
const ls=(d,re)=>fs.readdirSync(d).filter(f=>re.test(f)).sort();
const applied=new Map();
for(const f of ls(P,/^g0\d+-apply\.json$/)){const j=read(P+f);for(const it of(j&&j.items)||[])if(String(it.src||it.file||'').startsWith('카드-'))applied.set(String(it.id),String(it.file||it.src).replace('.json','').split(' ')[0]);}
console.log('applied',applied.size);
const judged=new Map();
for(const f of ls(A,/^v\d+-tone\.json$/)){const j=read(A+f);if(j)for(const [k,v] of Object.entries(j))if(v&&v.verdict&&String(v.file||'').startsWith('카드-'))judged.set(String(v.id??k),{v:v.verdict,f,lane:v.lane});}
console.log('judged',judged.size, [...new Set([...judged.values()].map(x=>x.lane))]);
const cnt={};for(const x of judged.values())cnt[x.v]=(cnt[x.v]||0)+1;console.log(cnt);
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const rows=(await db.query("select id,question_text,difficulty_score,category_id from questions where status='approved' and is_active")).rows;
const act=new Set(rows.map(r=>String(r.id)));
let a=0,b=0;const tgt=[];
for(const r of rows){const id=String(r.id);if(!applied.has(id))continue;a++;if(judged.has(id)){b++;continue;}tgt.push(r);}
console.log('active',rows.length,'activeApplied',a,'alreadyJudged',b,'target',tgt.length);
const emo=tgt.filter(r=>/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(r.question_text));console.log('emoji',emo.length);
const byfile={};for(const r of tgt){const f=applied.get(String(r.id));byfile[f]=(byfile[f]||0)+1}
console.log(JSON.stringify(byfile));
await db.end();
