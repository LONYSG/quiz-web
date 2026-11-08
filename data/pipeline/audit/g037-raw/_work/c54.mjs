// ⓒ 54 — proposal 거르기: checkHint · crossans(보정 뒤) · 정답 글자 · 120자
import { rj, wj, withDb, ROWSQL } from './db.mjs';
import { checkHint } from '../../../../../scripts/hint-check.mjs';
import { crossAnswers } from '../../../../../scripts/hint-crossans.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
const P = rj('g037-plan.json'); const Q = new Map(P.Q.map((q) => [q.id, q]));
const L = (s) => [...(s ?? '')].length;
await withDb(async (c) => {
  const rows = new Map((await c.query(ROWSQL, [P.C54.map((x) => x.id)])).rows.map((r) => [r.id, r]));
  const prim = (await c.query(`select a.question_id::text id, a.answer_norm norm, q.display_answer answer from question_answers a join questions q on q.id=a.question_id and q.is_active where a.is_primary`)).rows;
  const out = [];
  for (const x of P.C54) {
    const r = rows.get(String(x.id)); const q = Q.get(String(x.id))?.fix_text ?? r.question_text;
    const ck = checkHint({ hint: x.proposal, answer: r.display_answer, variants: r.variants, question: q, explanation: r.explanation ?? '' });
    const cr = crossAnswers({ id: x.id, hint: x.proposal, answerNorm: normalizeAnswer(r.display_answer) }, prim);
    const why = [];
    if (ck.block.length) why.push('block ' + ck.block.map((b) => b.frag ?? b.kind).join('/'));
    for (const w of ck.warn) why.push(`warn ${w.kind}${w.frag ? ' ' + w.frag : ''}${w.share ? ' ' + w.share + '%' : ''}`);
    if (cr.length) why.push('crossans ' + cr.map((y) => `#${y.id} ${y.answer}`).join(' · '));
    if (L(x.proposal) > 120) why.push('120자');
    out.push({ ...x, why });
    console.log(`#${x.id} ${x.answer} [${x.cls}] ${x.cross}${x.inQ ? ' (ⓐ)' : ''}\n 전 ${x.hint}\n 후 ${x.proposal}\n ${why.join(' | ') || 'ok'}`);
  }
  wj('g037-raw/c54-check.json', out);
});
