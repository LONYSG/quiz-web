// E — 끝 점검: 활성 · pending · 질문 검사(활성 전체) · 바뀐 열(백업 대신 V037 사본 · undo 대조)
import { rj, withDb } from './db.mjs';
import { checkAnswerSet } from '../../../../../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../../../../../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
const L = (s) => [...(s ?? '')].length;
const sents = (s) => s.split(/(?<=[.?!])\s+/).filter(Boolean);
const T = new Map(rj('v037-raw/targets.json').items.map((x) => [x.id, x]));
await withDb(async (c) => {
  const n = (await c.query(`select count(*) filter (where is_active)::int act, count(*) filter (where status='pending_review')::int pend from questions`)).rows[0];
  const open = (await c.query('select count(*)::int n from games where ended_at is null')).rows[0].n;
  const rows = (await c.query(`select q.id::text id, q.question_text, q.display_answer, coalesce((select array_agg(answer_text) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') v from questions q where q.is_active`)).rows;
  let blk = 0, blank = 0, o240 = 0; const o70 = [];
  for (const r of rows) {
    if (checkAnswerSet(r.question_text, r.display_answer, r.v, normalizeAnswer).blocked.length) blk++;
    if (!blankCheck(r.question_text, r.display_answer).ok) blank++;
    if (L(r.question_text) > 240) o240++;
    if (T.has(r.id) && sents(r.question_text).some((s) => L(s) > 70)) o70.push(r.id);
  }
  const ch = (await c.query(`select q.id::text id, q.question_text, q.general_hint, q.explanation, q.worth, q.difficulty_score from questions q where q.id = any($1::bigint[])`, [[...T.keys()].map(Number)])).rows;
  const d = { question_text: 0, general_hint: 0, explanation: 0, worth: 0 };
  for (const r of ch) { const t = T.get(r.id); for (const k of ['question_text', 'general_hint', 'explanation']) if (t[k] !== r[k]) d[k]++; if (t.worth !== r.worth) d.worth++; }
  const qa = (await c.query(`select count(*)::int n from question_answers where note like 'G035%'`)).rows[0].n;
  console.log({ ...n, open, checkAnswerSet_block: blk, blank, over240: o240, over70_V037set: o70, changed_vs_V037: d, variants_added_G035: qa });
});
