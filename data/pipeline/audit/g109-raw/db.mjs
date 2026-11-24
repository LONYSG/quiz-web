// G109(G107 그대로) — DB 읽기만: 등급 × 대분류 표 + 정답 목록(활성 + 꺼진 것)
import pg from 'pg'; import { writeFileSync } from 'node:fs';
process.loadEnvFile?.('.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const t = (await c.query(`select t.major_name m, q.difficulty_score g, count(*) n from questions q join category_tree t on t.category_id=q.category_id where q.is_active group by 1,2 order by 1,2`)).rows;
const tab = {}; for (const r of t) { (tab[r.m] ??= {})[r.g ?? '-'] = +r.n; }
const lines = ['대분류 | 1 | 2 | 3 | 4 | 5 | 없음 | 계'];
const tot = {1:0,2:0,3:0,4:0,5:0,'-':0};
for (const [m, o] of Object.entries(tab)) { let s=0; const row=[1,2,3,4,5,'-'].map(g=>{const v=o[g]||0; s+=v; tot[g]+=v; return v;}); lines.push(`${m} | ${row.join(' | ')} | ${s}`); }
lines.push(`계 | ${[1,2,3,4,5,'-'].map(g=>tot[g]).join(' | ')} | ${Object.values(tot).reduce((a,b)=>a+b,0)}`);
writeFileSync('data/pipeline/audit/g109-raw/grade-major.txt', lines.join('\n')+'\n');
console.log(lines.join('\n'));
const mids = (await c.query(`select major_name, mid_name, count(*) filter (where q.is_active) n from category_tree t left join questions q on q.category_id=t.category_id group by 1,2 order by 1,2`)).rows;
writeFileSync('data/pipeline/audit/g109-raw/categories.txt', mids.map(r=>`${r.major_name} > ${r.mid_name} (${r.n})`).join('\n')+'\n');
const a = (await c.query(`select q.id, q.is_active act, q.display_answer d, coalesce(string_agg(distinct a.answer_text, '|'),'') v from questions q left join question_answers a on a.question_id=q.id group by q.id order by q.id`)).rows;
writeFileSync('data/pipeline/audit/g109-raw/answers.tsv', a.map(r=>`${r.id}\t${r.act?1:0}\t${r.d}\t${r.v}`).join('\n')+'\n');
console.log('answers', a.length, 'active', a.filter(r=>r.act).length);
await c.end();
