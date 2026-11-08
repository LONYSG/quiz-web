// A — g038-plan.json: G037 뒤 crossans(보정 뒤) 를 호스트 힌트 단위로 · V038 100 · G037 힌트 바꾼 것 제외 · 조각 in/*.json
import { rj, wj, withDb } from './db.mjs';
import { writeFileSync } from 'node:fs';
import { crossAnswers } from '../../../../../scripts/hint-crossans.mjs';
const V100 = new Set(rj('v038-crossans.json').items.map((x) => String(x.id)));
const G037H = new Set(Object.values(rj('g037-decisions.json').items).filter((d) => d.general_hint !== undefined).map((d) => String(d.id)));
const R12 = rj('g037-decisions.json').notTaken.crossans;
await withDb(async (c) => {
  const rows = (await c.query(`select q.id::text id, q.question_text, q.display_answer, q.general_hint, q.explanation, q.difficulty_score g from questions q where q.is_active and q.general_hint is not null order by q.id`)).rows;
  const prim = (await c.query(`select a.question_id::text id, a.answer_norm norm, q.display_answer answer from question_answers a join questions q on q.id=a.question_id and q.is_active where a.is_primary`)).rows;
  const normOf = new Map(prim.map((p) => [p.id, p.norm])); const Q = new Map(rows.map((r) => [r.id, r]));
  const qText = new Map((await c.query('select id::text id, question_text from questions where is_active')).rows.map((r) => [r.id, r.question_text]));
  const hosts = []; let pairs = 0; const ex = { v038: 0, g037: 0 };
  for (const r of rows) {
    const cr = crossAnswers({ id: r.id, hint: r.general_hint, answerNorm: normOf.get(r.id) }, prim);
    if (!cr.length) continue; pairs += cr.length;
    if (V100.has(r.id)) { ex.v038++; continue; } if (G037H.has(r.id)) { ex.g037++; continue; }
    hosts.push({ id: +r.id, grade: r.g, answer: r.display_answer, question: r.question_text, hint: r.general_hint, explanation: r.explanation, cross: cr.map((y) => ({ crossId: +y.id, crossAnswer: y.answer, crossQuestion: qText.get(y.id) })) });
  }
  let seed = 20261108; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const sh = hosts.map((h) => [rnd(), h]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const N = Math.ceil(sh.length / 100); const pieces = [];
  for (let i = 0; i < N; i++) { const part = sh.filter((_, k) => k % N === i).sort((a, b) => a.id - b.id); const f = `p${String(i + 1).padStart(2, '0')}`; writeFileSync(`data/pipeline/audit/g038-raw/in/${f}.json`, JSON.stringify(part, null, 1)); pieces.push({ piece: f, n: part.length }); }
  const r12 = R12.map((x) => { const r = Q.get(String(x.id)); return { id: x.id, cls: x.cls, answer: r.display_answer, question: r.question_text, hint: r.general_hint, explanation: r.explanation, cross: x.cross, rejectedProposal: x.proposal, why: x.why }; });
  writeFileSync('data/pipeline/audit/g038-raw/in/r12.json', JSON.stringify(r12, null, 1));
  wj('g038-plan.json', { round: 'G038', at: new Date().toISOString(), counts: { pairs, uniqueHosts: pairs && rows.length, hostsWithCross: hosts.length + ex.v038 + ex.g037, excluded: ex, targets: hosts.length, pieces: N, rewriteOnly12: r12.length }, pieces });
  console.log({ pairs, hostsAll: hosts.length + ex.v038 + ex.g037, ex, targets: hosts.length, N });
});
