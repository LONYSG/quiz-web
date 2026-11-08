// A — g035-plan.json: Q 358 · H 후보(새 질문으로 checkHint + crossans) · V 39 · F 36 · U 17
import { rj, wj, withDb, ROWSQL } from './db.mjs';
import { checkHint } from '../../../../../scripts/hint-check.mjs';
import { crossAnswers } from '../../../../../scripts/hint-crossans.mjs';
import { checkAnswerSet } from '../../../../../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
const R = rj('v037-refurb.json').items;
const L = (s) => [...(s ?? '')].length;
// 문장 나누기(기계) — 마침표·물음표 뒤 공백. 인용문 끝 마침표·이니셜 오탐은 눈으로
export const sents = (s) => s.split(/(?<=[.?!])\s+/).filter(Boolean);
await withDb(async (c) => {
  const rows = new Map((await c.query(ROWSQL, [R.map((x) => +x.id)])).rows.map((r) => [r.id, r]));
  const prim = (await c.query(`select a.question_id::text id, a.answer_norm norm, q.display_answer answer from question_answers a join questions q on q.id=a.question_id and q.is_active where a.is_primary`)).rows;
  const normOf = new Map(prim.map((p) => [p.id, p.norm]));
  const Q = []; const H = []; const V = []; const F = []; const U = []; const other = [];
  for (const x of R) {
    const r = rows.get(x.id);
    const fl = (k) => (x.flags ?? []).filter((f) => f.startsWith(k));
    if (fl('variant_missing').length) V.push({ id: x.id, verdict: x.verdict, answer: r.display_answer, variants: r.variants, flag: fl('variant_missing') });
    if (fl('fact_doubt').length) F.push({ id: x.id, verdict: x.verdict, answer: r.display_answer, flag: fl('fact_doubt') });
    if (fl('not_unique').length) U.push({ id: x.id, verdict: x.verdict, answer: r.display_answer, flag: fl('not_unique') });
    const rest = (x.flags ?? []).filter((f) => !/^(variant_missing|fact_doubt|not_unique)/.test(f));
    if (rest.length) other.push({ id: x.id, verdict: x.verdict, flag: rest });
    if (x.verdict !== 'fix') continue;
    const ss = sents(x.fix_text);
    Q.push({ id: x.id, grade: x.grade, answer: r.display_answer, before: r.question_text, fix_text: x.fix_text, len: L(x.fix_text), sents: ss.length, over70: ss.filter((s) => L(s) > 70).map(L), refit: x.hint_refit, g030_fixed: x.g030_fixed, reread: x.reread });
    const ck = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants, question: x.fix_text, explanation: r.explanation ?? '' });
    const ckOld = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' });
    const cr = crossAnswers({ id: x.id, hint: r.general_hint, answerNorm: normOf.get(x.id) }, prim);
    const why = [];
    if (ck.block.length) why.push('block ' + ck.block.map((b) => b.frag).join('/'));
    const wq = ck.warn.find((w) => w.kind === 'question'); const wqOld = ckOld.warn.find((w) => w.kind === 'question');
    if (wq) why.push(`H3 ${wq.share}%` + (wqOld ? ` (전 ${wqOld.share}%)` : ' (새로)'));
    for (const w of ck.warn) if (!['question', 'explain'].includes(w.kind)) why.push(`${w.kind} ${w.frag ?? ''}`);
    if (cr.length) why.push('crossans ' + cr.map((y) => `#${y.id} ${y.answer}`).join(' · '));
    if (L(r.general_hint) > 120) why.push('120자 넘음');
    if (x.hint_refit === 'yes') why.push('hint_refit');
    const g = checkAnswerSet(x.fix_text, r.display_answer, r.variants, normalizeAnswer);
    if (g.blocked.length) why.push('정답묶음 막힘 ' + JSON.stringify(g.blocked));
    H.push({ id: x.id, answer: r.display_answer, hint: r.general_hint, why });
  }
  const Hc = H.filter((h) => h.why.length);
  wj('g035-plan.json', { round: 'G035', at: new Date().toISOString(), source: 'v037-refurb.json', counts: { Q: Q.length, H_checked: H.length, H_candidates: Hc.length, V: V.length, F: F.length, U: U.length, other: other.length, Q_over70: Q.filter((q) => q.over70.length).length, Q_over240: Q.filter((q) => q.len > 240).length, Q_sents_out: Q.filter((q) => q.sents < 2 || q.sents > 4).length }, Q, H_candidates: Hc, V, F, U, other });
  console.log({ Q: Q.length, Hc: Hc.length, V: V.length, F: F.length, U: U.length, other: other.length });
  const kinds = {}; for (const h of Hc) for (const w of h.why) { const k = w.split(' ')[0]; kinds[k] = (kinds[k] ?? 0) + 1; } console.log(kinds);
  console.log('over70', Q.filter((q) => q.over70.length).map((q) => q.id + ':' + q.over70).join(' '));
  console.log('sents out', Q.filter((q) => q.sents < 2 || q.sents > 4).map((q) => q.id + ':' + q.sents).join(' '));
});
