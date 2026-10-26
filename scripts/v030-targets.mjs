// V030 대상 — 활성 문항 전수의 질문·정답·변형·해설·분야·difficulty_score 조회 (읽기 전용)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const A = 'C:/work/quiz-web/data/pipeline/audit';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.difficulty_score, ct.mid_name, ct.sub_name, ct.major_name from questions q left join category_tree ct on ct.category_id=q.category_id where q.is_active order by q.id`)).rows;
const vars = (await c.query('select question_id, answer_text, is_primary from question_answers')).rows;
const cols = (await c.query(`select column_name from information_schema.columns where table_name='questions' and column_name='worth'`)).rows.length;
await c.end();
const vmap = {}; for (const v of vars) (vmap[v.question_id] ||= []).push(v);
const items = {};
for (const r of rows) items[r.id] = { id: Number(r.id), question: r.question_text, answer: r.display_answer, variants: (vmap[r.id] || []).filter((v) => !v.is_primary).map((v) => v.answer_text), explanation: r.explanation, hint: r.general_hint, major: r.major_name, mid: r.mid_name, sub: r.sub_name, dif: r.difficulty_score };
fs.writeFileSync(A + '/v030-raw/targets.json', JSON.stringify({ builtAt: new Date().toISOString(), active: rows.length, worthColumn: cols === 1, items }));
console.log({ active: rows.length, worthColumn: cols === 1 });
