import pg from 'pg'; import path from 'node:path';
process.loadEnvFile?.(new URL('../../../../.env', import.meta.url));
const u=new URL(process.env.DATABASE_URL); u.pathname='/'+(process.argv[2]||'quizweb');
const c=new pg.Client({connectionString:u.toString()}); await c.connect();
const cols=(await c.query(`select column_name,data_type,is_nullable,column_default from information_schema.columns where table_name='categories' order by ordinal_position`)).rows;
console.log(cols.map(r=>`${r.column_name}:${r.data_type}${r.is_nullable==='NO'?'!':''}${r.column_default?'='+r.column_default:''}`).join(' | '));
const t=(await c.query(`select c.id::int,c.key,c.name_ko,c.parent_id::int,c.level,(select count(*) from questions q where q.category_id=c.id and q.is_active)::int n from categories c order by c.level,c.id`)).rows;
const by=new Map(t.map(r=>[r.id,r]));
for (const m of t.filter(r=>r.level===1)) { console.log(`# ${m.id} ${m.key} ${m.name_ko}`);
  for (const d of t.filter(r=>r.parent_id===m.id)) console.log(`  ${d.id} ${d.key} ${d.name_ko}: `+t.filter(r=>r.parent_id===d.id).map(l=>`${l.id}:${l.key.split('#')[1]}:${l.name_ko}(${l.n})`).join(' · ')); }
await c.end();
