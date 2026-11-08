// E — 끝 점검: 활성 전체 checkAnswerSet 막힘 · blank · 240자
import { withDb } from './db.mjs';
import { checkAnswerSet } from '../../../../../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../../../../../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
await withDb(async (c) => {
  const rows = (await c.query(`select q.id, q.question_text, q.display_answer, coalesce((select array_agg(answer_text) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') v from questions q where q.is_active`)).rows;
  let blk = 0, blank = 0, o240 = 0;
  for (const r of rows) { if (checkAnswerSet(r.question_text, r.display_answer, r.v, normalizeAnswer).blocked.length) blk++; if (!blankCheck(r.question_text, r.display_answer).ok) blank++; if ([...r.question_text].length > 240) o240++; }
  console.log({ active: rows.length, checkAnswerSet_block: blk, blank, over240: o240 });
});
