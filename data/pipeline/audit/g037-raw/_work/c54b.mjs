import { rj, wj, withDb } from './db.mjs';
import { crossAnswers } from '../../../../../scripts/hint-crossans.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
const X = rj('g037-raw/c54-check.json'); const V = new Map(rj('v038-crossans.json').items.map((x) => [x.id, x]));
await withDb(async (c) => {
  const prim = (await c.query(`select a.question_id::text id, a.answer_norm norm, q.display_answer answer from question_answers a join questions q on q.id=a.question_id and q.is_active where a.is_primary`)).rows;
  for (const x of X) {
    const an = normalizeAnswer(x.answer);
    const o = new Set(crossAnswers({ id: x.id, hint: x.hint, answerNorm: an }, prim).map((y) => y.id));
    const n = crossAnswers({ id: x.id, hint: x.proposal, answerNorm: an }, prim);
    const crossId = String(V.get(x.id).crossId);
    x.newCross = n.filter((y) => !o.has(y.id)).map((y) => `#${y.id} ${y.answer}`);
    x.targetLeft = n.some((y) => y.id === crossId);
    x.block = x.why.some((w) => w.startsWith('block'));
    x.take = !x.newCross.length && !x.targetLeft && !x.block;
  }
  wj('g037-raw/c54-check.json', X);
  console.log('take', X.filter((x) => x.take).length, 'drop', X.filter((x) => !x.take).map((x) => `${x.id} ${x.answer}: ${x.targetLeft ? '대상 남음 ' : ''}${x.newCross.join(',')}${x.block ? ' block' : ''}`).join(' / '));
  console.log(X.filter((x) => x.why.some((w) => w.startsWith('warn'))).map((x) => x.id + ' ' + x.why.join(';')).join('\n'));
});
