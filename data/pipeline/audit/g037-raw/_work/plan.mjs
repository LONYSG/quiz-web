// A — g037-plan.json: ⓐ fix 127 · 힌트 후보(새 질문으로 checkHint + crossans) · ⓑ flags · ⓒ crossans 54 · 사본 대조
import { rj, wj, withDb, ROWSQL } from './db.mjs';
import { checkHint } from '../../../../../scripts/hint-check.mjs';
import { crossAnswers } from '../../../../../scripts/hint-crossans.mjs';
import { checkAnswerSet } from '../../../../../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
const R = rj('v038-refurb.json').items;
const T = new Map(rj('v038-raw/targets.json').items.map((x) => [String(x.id), x]));
const CR = rj('v038-crossans.json').items;
const L = (s) => [...(s ?? '')].length;
export const sents = (s) => s.split(/(?<=[.?!])\s+/).filter(Boolean);
const FK = [['variant_missing', /^variant_missing/], ['fact_doubt', /^fact_doubt/], ['not_unique', /^not_unique/], ['h3h12', /^(h3|h12|hint_h3)/], ['category', /^category/], ['dup_answer', /^dup_answer/], ['hint_leak', /^hint_leak/]];
await withDb(async (c) => {
  const ids = [...new Set([...R.map((x) => +x.id), ...CR.map((x) => +x.id)])];
  const rows = new Map((await c.query(ROWSQL, [ids])).rows.map((r) => [r.id, r]));
  const prim = (await c.query(`select a.question_id::text id, a.answer_norm norm, q.display_answer answer from question_answers a join questions q on q.id=a.question_id and q.is_active where a.is_primary`)).rows;
  const normOf = new Map(prim.map((p) => [p.id, p.norm]));
  const Q = []; const H = []; const flags = Object.fromEntries(FK.map(([k]) => [k, []])); flags.other = []; const drift = [];
  for (const x of R) {
    const r = rows.get(x.id); const s = T.get(x.id);
    const dr = ['question_text', 'general_hint', 'display_answer'].filter((k) => s[k] !== r[k]);
    if (JSON.stringify([...(s.variants ?? [])].sort()) !== JSON.stringify([...r.variants].sort())) dr.push('variants');
    if (dr.length) drift.push({ id: x.id, src: 'refurb', fields: dr, fix: x.rr_verdict === 'fix' });
    for (const f of x.flags ?? []) { const k = FK.find(([, re]) => re.test(f)); (k ? flags[k[0]] : flags.other).push({ id: x.id, verdict: x.rr_verdict, answer: r.display_answer, flag: f }); }
    if (x.rr_verdict !== 'fix') continue;
    const ss = sents(x.fix_text);
    Q.push({ id: x.id, grade: x.grade, answer: r.display_answer, before: r.question_text, fix_text: x.fix_text, len: L(x.fix_text), sents: ss.length, over70: ss.filter((t) => L(t) > 70).map(L), refit: x.hint_refit, rr_note: x.rr_note, flags: x.flags });
    const ck = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants, question: x.fix_text, explanation: r.explanation ?? '' });
    const ckOld = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' });
    const cr = crossAnswers({ id: x.id, hint: r.general_hint, answerNorm: normOf.get(x.id) }, prim);
    const why = [];
    if (ck.block.length) why.push('block ' + ck.block.map((b) => b.frag).join('/'));
    const wq = ck.warn.find((w) => w.kind === 'question'); const wqOld = ckOld.warn.find((w) => w.kind === 'question');
    if (wq) why.push(`H3 ${wq.share}%` + (wqOld ? ` (전 ${wqOld.share}%)` : ' (새로)'));
    for (const w of ck.warn) if (!['question', 'explain'].includes(w.kind)) why.push(`${w.kind} ${w.frag ?? ''}`);
    if (cr.length) why.push('crossans ' + cr.map((y) => `#${y.id} ${y.answer}`).join(' · '));
    const g = checkAnswerSet(x.fix_text, r.display_answer, r.variants, normalizeAnswer);
    if (g.blocked.length) why.push('정답묶음 막힘 ' + JSON.stringify(g.blocked));
    H.push({ id: x.id, answer: r.display_answer, hint: r.general_hint, first: ss[0], why });
  }
  const C54 = []; const Cskip = [];
  for (const x of CR) {
    const r = rows.get(String(x.id));
    if (!['A', 'L'].includes(x.cls)) continue;
    if (!r.is_active || r.general_hint !== x.hint) { Cskip.push({ id: x.id, cls: x.cls, why: !r.is_active ? '비활성' : '힌트가 사본과 다름', now: r.general_hint }); continue; }
    C54.push({ n: x.n, id: x.id, cls: x.cls, answer: x.answer, hint: x.hint, cross: `#${x.crossId} ${x.crossAnswer}`, proposal: x.proposal, inQ: R.some((y) => y.id === String(x.id) && y.rr_verdict === 'fix') });
  }
  const Hc = H.filter((h) => h.why.length);
  const counts = { Q: Q.length, g1: Q.filter((q) => q.grade === 1).length, g2: Q.filter((q) => q.grade === 2).length, H_candidates: Hc.length, C54: C54.length, Cskip: Cskip.length, drift: drift.length, Q_over70: Q.filter((q) => q.over70.length).length, Q_over240: Q.filter((q) => q.len > 240).length, Q_sents_out: Q.filter((q) => q.sents < 2 || q.sents > 4).length, ...Object.fromEntries(Object.entries(flags).map(([k, v]) => ['flag_' + k, v.length])) };
  wj('g037-plan.json', { round: 'G037', at: new Date().toISOString(), source: ['v038-refurb.json', 'v038-crossans.json', 'v038-raw/targets.json'], counts, drift, Q, H_candidates: Hc, flags, C54, Cskip });
  console.log(counts); console.log('drift', JSON.stringify(drift)); console.log('Cskip', JSON.stringify(Cskip));
  const kinds = {}; for (const h of Hc) for (const w of h.why) { const k = w.split(' ')[0]; kinds[k] = (kinds[k] ?? 0) + 1; } console.log(kinds);
  console.log('over70', Q.filter((q) => q.over70.length).map((q) => q.id + ':' + q.over70).join(' '));
  console.log('sents out', Q.filter((q) => q.sents < 2 || q.sents > 4).map((q) => q.id + ':' + q.sents).join(' '));
  console.log('C54 in Q', C54.filter((x) => x.inQ).map((x) => x.id).join(' '));
});
