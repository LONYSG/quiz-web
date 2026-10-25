import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const W = 'C:/work/quiz-web/data/pipeline/audit/v027-raw/_work';
const md = fs.readFileSync('C:/work/quiz-web/ai-out/briefs/difficulty-draft.md', 'utf8').split('## 8. v2 기준 샘플')[1];
const out = []; let lvl = 0;
for (const line of md.split('\n')) {
  const h = line.match(/^### v2 등급 (\d)/); if (h) { lvl = +h[1]; continue; }
  const m = line.match(/^\| (\d+) \| (.+?) \| (.+?) \| (\d)→(\d) \|/);
  if (m && lvl) out.push({ id: +m[1], gist: m[2], answer: m[3], lvl, cur: +m[4], v2: +m[5] });
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query('select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.is_active, ct.mid_name from questions q left join category_tree ct on ct.category_id=q.category_id where q.id = any($1)', [out.map((x) => x.id)])).rows;
const vars = (await c.query('select question_id, answer_text from question_answers where question_id = any($1) and not is_primary', [out.map((x) => x.id)])).rows;
await c.end();
const byId = new Map(rows.map((r) => [Number(r.id), r]));
let bad = 0;
for (const a of out) { const r = byId.get(a.id); if (!r) { console.log('missing', a.id); bad++; continue; }
  a.question = r.question_text; a.dbAnswer = r.display_answer; a.explanation = r.explanation; a.hint = r.general_hint; a.category = r.mid_name; a.active = r.is_active;
  a.variants = vars.filter((v) => +v.question_id === a.id).map((v) => v.answer_text);
  if (!(r.display_answer.replace(/\s/g, '').includes(a.answer.replace(/\s/g, '').slice(0, 2)))) { console.log('answer?', a.id, a.answer, '|', r.display_answer); bad++; } }
fs.writeFileSync(W + '/anchors52.json', JSON.stringify(out, null, 1));
const cnt = {}; for (const a of out) cnt[a.lvl] = (cnt[a.lvl] || 0) + 1;
console.log(out.length, cnt, 'bad', bad, 'inactive', out.filter((a) => a.active === false).map((a) => a.id));
