// 제안문 기계 거르기 — checkHint 막힘 · 경고 · crossans(전 힌트에 없던 새 것 · 대상 남음) · 120자
//   node check-prop.mjs <json: [{id, proposal, cross?:[{crossId,cls}]}] | r12>  → 결과 출력 · --json 파일로
import { rj, withDb, ROWSQL } from './db.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { checkHint } from '../../../../../scripts/hint-check.mjs';
import { crossAnswers } from '../../../../../scripts/hint-crossans.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
export async function checkProps(list) {
  return withDb(async (c) => {
    const rows = new Map((await c.query(ROWSQL, [list.map((x) => +x.id)])).rows.map((r) => [r.id, r]));
    const prim = (await c.query(`select a.question_id::text id, a.answer_norm norm, q.display_answer answer from question_answers a join questions q on q.id=a.question_id and q.is_active where a.is_primary`)).rows;
    return list.map((x) => {
      const r = rows.get(String(x.id)); const an = normalizeAnswer(r.display_answer);
      const ck = checkHint({ hint: x.proposal, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' });
      const old = new Set(crossAnswers({ id: x.id, hint: r.general_hint, answerNorm: an }, prim).map((y) => y.id));
      const now = crossAnswers({ id: x.id, hint: x.proposal, answerNorm: an }, prim);
      const fix = new Set((x.cross ?? []).filter((y) => ['A', 'L'].includes(y.cls)).map((y) => String(y.crossId)));
      const res = { id: x.id, block: ck.block.map((b) => b.frag ?? b.kind), warn: ck.warn.map((w) => w.kind + (w.frag ? ' ' + w.frag : '')), newCross: now.filter((y) => !old.has(y.id)).map((y) => `#${y.id} ${y.answer}`), targetLeft: now.filter((y) => fix.has(y.id)).map((y) => `#${y.id} ${y.answer}`), len: [...x.proposal].length, before: r.general_hint };
      res.ok = !res.block.length && !res.newCross.length && !res.targetLeft.length && res.len <= 120;
      return res;
    });
  });
}
if (process.argv[1]?.endsWith('check-prop.mjs')) {
  const a = process.argv[2];
  const list = a === 'r12' ? Object.entries(rj('g038-raw/r12-gen.json').items).map(([id, [p]]) => ({ id: +id, proposal: p, cross: [] })) : JSON.parse(readFileSync(a, 'utf8')).filter((x) => x.proposal);
  const r = await checkProps(list);
  for (const x of r.filter((y) => !y.ok || y.warn.length)) console.log(x.id, x.ok ? 'ok(경고)' : '★', JSON.stringify({ b: x.block, w: x.warn, n: x.newCross, t: x.targetLeft, len: x.len }));
  console.log('ok', r.filter((x) => x.ok).length, '/', r.length);
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(r, null, 1));
}
