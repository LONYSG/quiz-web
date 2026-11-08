// B·C — rr-*.json(GEN 재독 결정) 을 모아 최종 질문/힌트 표 + 기계 점검
import { readdirSync, readFileSync } from 'node:fs';
import { rj, wj, withDb, ROWSQL, AUD } from './db.mjs';
import { checkHint } from '../../../../../scripts/hint-check.mjs';
import { checkAnswerSet } from '../../../../../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../../../../../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../../../../../shared/dist/index.js';
const L = (s) => [...(s ?? '')].length;
const sents = (s) => s.split(/(?<=[.?!])\s+/).filter(Boolean);
const P = rj('g035-plan.json');
const rr = { q: {}, h: {}, notTaken: {}, keepNote: {}, factResolved: {}, defer: [] };
for (const f of readdirSync(AUD('g035-raw/rr')).filter((f) => f.endsWith('.json')).sort()) {
  const o = JSON.parse(readFileSync(AUD('g035-raw/rr/' + f), 'utf8'));
  for (const k of ['q', 'h', 'notTaken', 'keepNote', 'factResolved']) Object.assign(rr[k], o[k] ?? {});
  rr.defer.push(...(o.defer ?? []));
}
const out = [];
await withDb(async (c) => {
  const rows = new Map((await c.query(ROWSQL, [P.Q.map((q) => +q.id)])).rows.map((r) => [r.id, r]));
  for (const q of P.Q) {
    const r = rows.get(q.id);
    const qt = rr.q[q.id]?.after ?? q.fix_text;
    const hint = rr.h[q.id]?.hint ?? r.general_hint;
    const ss = sents(qt);
    const ck = checkHint({ hint, answer: r.display_answer, variants: r.variants, question: qt, explanation: r.explanation ?? '' });
    const g = checkAnswerSet(qt, r.display_answer, r.variants, normalizeAnswer);
    const pr = [];
    if (L(qt) > 240) pr.push('240');
    const o70 = ss.filter((s) => L(s) > 70).map(L); if (o70.length) pr.push('70:' + o70);
    if (ss.length < 2 || ss.length > 4) pr.push('sents:' + ss.length);
    if (!blankCheck(qt, r.display_answer).ok) pr.push('blank');
    if (g.blocked.length) pr.push('ans:' + JSON.stringify(g.blocked));
    if (ck.block.length) pr.push('hint-block:' + ck.block.map((b) => b.frag).join('/'));
    const wq = ck.warn.find((w) => w.kind === 'question'); if (wq) pr.push('H3:' + wq.share);
    if (L(hint) > 120) pr.push('hint120');
    out.push({ id: q.id, q: qt, qEdited: !!rr.q[q.id], hint, hEdited: !!rr.h[q.id], pr });
  }
});
wj('g035-raw/q-final.json', { rr, items: out });
console.log('Q edited', Object.keys(rr.q).length, 'H edited', Object.keys(rr.h).length, 'defer', rr.defer);
for (const o of out.filter((o) => o.pr.length)) console.log(o.id, o.pr.join(' '));
