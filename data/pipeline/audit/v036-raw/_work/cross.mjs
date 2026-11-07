import fs from 'node:fs';import pg from 'pg';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
import { crossAnswers } from '../../../../../scripts/hint-crossans.mjs';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const T=JSON.parse(fs.readFileSync('data/pipeline/audit/v036-raw/targets-g032-484.json','utf8')).items;
const M=JSON.parse(fs.readFileSync('data/pipeline/audit/v036-raw/merged-raw.json','utf8'));const mm=Object.fromEntries(M.map(x=>[x.id,x]));
const act=(await db.query(`select id::text,display_answer,general_hint from questions where is_active`)).rows;
const prim=act.map(a=>({id:a.id,norm:normalizeAnswer(a.display_answer),answer:a.display_answer}));
const out={fwd:[],fwdFix:[],rev:[],same:[]};
for(const t of T){const an=normalizeAnswer(t.answer);
 const x=crossAnswers({id:t.id,hint:t.hint,answerNorm:an},prim);if(x.length)out.fwd.push({id:t.id,answer:t.answer,hint:t.hint,cross:x,judgeHint:mm[t.id].hint});
 if(mm[t.id].hint_fix){const y=crossAnswers({id:t.id,hint:mm[t.id].hint_fix,answerNorm:an},prim);if(y.length)out.fwdFix.push({id:t.id,fix:mm[t.id].hint_fix,cross:y})}
 if(prim.some(p=>p.norm===an))out.same.push(t.id)}
const pend=T.map(t=>({id:t.id,norm:normalizeAnswer(t.answer),answer:t.answer}));
for(const a of act){const x=crossAnswers({id:a.id,hint:a.general_hint,answerNorm:normalizeAnswer(a.display_answer)},pend);if(x.length)out.rev.push({activeId:a.id,activeAns:a.display_answer,leaks:x})}
fs.writeFileSync('data/pipeline/audit/v036-raw/crossans.json',JSON.stringify(out,null,1));
console.log('fwd',out.fwd.length,'fwdFix',out.fwdFix.length,'rev',out.rev.length,'same',out.same.length);
for(const f of out.fwd)console.log(f.id,f.answer,'→',f.cross.map(c=>'#'+c.id+' '+c.answer).join(','),'| judge:',mm[f.id].hint,mm[f.id].verdict);
for(const f of out.fwdFix)console.log('FIXLEAK',f.id,f.cross.map(c=>c.answer));
for(const r of out.rev)console.log('REV active',r.activeId,r.activeAns,'→',r.leaks.map(l=>l.id+':'+l.answer).join(','));
await db.end();
