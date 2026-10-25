// V028 대상 — v028-split.json 의 verify id 로 질문·정답·변형·해설·힌트·분야 조회 (읽기 전용)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const A = 'C:/work/quiz-web/data/pipeline/audit';
const S = JSON.parse(fs.readFileSync(A + '/v028-split.json', 'utf8'));
const ids = S.verify.map(Number);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.difficulty_score, q.is_active, ct.mid_name, ct.sub_name, ct.major_name, c.game_topic from questions q left join categories c on c.id=q.category_id left join category_tree ct on ct.category_id=q.category_id where q.id = any($1)`, [ids])).rows;
const vars = (await c.query('select question_id, answer_text, is_primary from question_answers where question_id = any($1)', [ids])).rows;
const activeCount = (await c.query('select count(*)::int n from questions where is_active')).rows[0].n;
await c.end();
const vmap = {}; for (const v of vars) (vmap[v.question_id] ||= []).push(v);
const items = {};
for (const r of rows) items[r.id] = { id: Number(r.id), active: r.is_active, question: r.question_text, answer: r.display_answer, variants: (vmap[r.id] || []).filter((v) => !v.is_primary).map((v) => v.answer_text), explanation: r.explanation, hint: r.general_hint, category: [r.major_name, r.mid_name, r.sub_name].filter(Boolean).join(' > '), gameTopic: r.game_topic, curDif: r.difficulty_score };
const act = Object.values(items).filter((x) => x.active).length;
fs.writeFileSync(A + '/v028-targets.json', JSON.stringify({ builtAt: new Date().toISOString(), activeAtStart: activeCount, requested: ids.length, found: rows.length, active: act, overlap: S.overlap, reported: S.reported, items }));
console.log({ requested: ids.length, found: rows.length, active: act, activeAtStart: activeCount, hasOverlap: S.overlap.every((i) => ids.includes(Number(i))), reportedIn: S.reported.map((i) => [i, ids.includes(i)]) });
