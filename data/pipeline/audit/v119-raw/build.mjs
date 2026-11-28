import fs from 'node:fs';
import pg from 'pg';
const D='data/pipeline/audit/v119-raw/';
const nm=JSON.parse(fs.readFileSync(D+'nomat.json','utf8'));
const cards=JSON.parse(fs.readFileSync('data/pipeline/audit/v118-cards.json','utf8')).cards;
const meta=(u)=>JSON.parse(fs.readFileSync(`data/pipeline/audit/v118-raw/${u}.meta.json`,'utf8'));
const extra=['4462'];
for(const [u,k] of [['u054','u054-038'],['u049',null]]){const m=meta(u);if(k){const c=m.cards.find(x=>x.key===k);extra.push(String(c.id));}}
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
let ids=nm.filter(n=>cards[n.id]?.verdict==='ok').map(n=>String(n.id));
// 장혁재 card
const jh=(await db.query("select id from questions where status='approved' and is_active and (question_text like '%장혁재%' or explanation like '%장혁재%')")).rows.map(r=>String(r.id));
console.log('장혁재',jh,'extra',extra);
const all=[...new Set([...extra,...jh,...ids])];
const rows=(await db.query('select id,question_text,display_answer,general_hint,explanation from questions where id=any($1)',[all.map(Number)])).rows;
const by=new Map(rows.map(r=>[String(r.id),r]));
const list=all.map(id=>{const r=by.get(id);return {id,q:r.question_text,a:r.display_answer,hint:r.general_hint,exp:r.explanation,why:extra.includes(id)?'named':jh.includes(id)?'jh':'nomat'}});
fs.writeFileSync(D+'targets.json',JSON.stringify(list));
const N=26;let b=0;
for(let i=0;i<list.length;i+=N){b++;const name='w'+String(b).padStart(2,'0');
fs.writeFileSync(D+name+'.in.json',JSON.stringify(list.slice(i,i+N),null,1));}
console.log(list.length,b);await db.end();
