// G111 — DB 읽기만: 중분류별 활성 등급 4 · 5 수 + 새재료-01~34 hard 분포
import pg from 'pg'; import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
process.loadEnvFile?.('.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const r = (await c.query(`select t.major_name||' > '||t.mid_name k, count(*) filter (where q.is_active and q.difficulty_score=4) g4, count(*) filter (where q.is_active and q.difficulty_score=5) g5, count(*) filter (where q.is_active) n from category_tree t left join questions q on q.category_id=t.category_id group by 1 order by 1`)).rows;
await c.end();
const O='web-desk/tone/보낼것/'; const m={};
for (const f of readdirSync(O).filter(f=>/^새재료-\d+\.json$/.test(f))) for (const it of JSON.parse(readFileSync(O+f,'utf8')).items) if (+it.gradeGuess>=4) { const k=`${it.major} > ${it.mid}`; m[k]=(m[k]||0)+1; }
const lines=r.map(x=>`${x.k}\t4:${x.g4}\t5:${x.g5}\t계:${x.n}\t새재료hard:${m[x.k]||0}`);
writeFileSync('data/pipeline/audit/g111-raw/mid45.txt', lines.join('\n')+'\n'); console.log(lines.join('\n'));
