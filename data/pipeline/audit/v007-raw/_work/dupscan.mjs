// 같은 지식 중복 후보 스캔 (E) — DB 읽기 전용. (가) 490 의 정답이 활성 문항 질문에 낱말로 들어 있고 글이 겹치는 것 + 반대 방향
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
process.loadEnvFile('C:/work/quiz-web/.env');
const { findAnswerInQuestion } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const { textOverlap, OVERLAP_MIN } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const items = JSON.parse(fs.readFileSync(SC + '/items.json', 'utf8'));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation from questions q where q.is_active`)).rows;
await c.end();
const out = [];
for (const x of items) {
  const tx = `${x.question} ${x.explanation ?? ''}`;
  for (const r of rows) {
    const rx = `${r.question_text} ${r.explanation ?? ''}`;
    const a = findAnswerInQuestion(r.question_text, x.answer) === 'word'; // 활성 질문에 내 정답이 들어 있음
    const b = findAnswerInQuestion(x.question, r.display_answer) === 'word'; // 내 질문에 활성 정답이 들어 있음
    if (!a && !b) continue;
    const ov = textOverlap(tx, rx);
    if (ov >= OVERLAP_MIN) out.push({ ref: x.ref, answer: x.answer, id: Number(r.id), activeAnswer: r.display_answer, dir: a && b ? 'both' : a ? 'myAnswerInActiveQ' : 'activeAnswerInMyQ', overlap: +ov.toFixed(2), myQ: x.question, activeQ: r.question_text, activeE: r.explanation });
  }
}
fs.writeFileSync(SC + '/dupscan.json', JSON.stringify(out, null, 1));
console.log('candidates', out.length);
for (const o of out) console.log(o.ref, o.answer, '<->', '#' + o.id, o.activeAnswer, o.dir, o.overlap);
