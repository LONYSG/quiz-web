// G064 — 문항별 게이트 분석(파일만): 새 질문 정답 노출 · 200자 · checkHint 새 block/새 question warn · 해설 빔/잘림 · explain 겹침
import { readFileSync, writeFileSync } from 'node:fs';
import { checkHint } from './hint-check.mjs';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { endText } from './g064-ending.mjs';
const p = JSON.parse(readFileSync('data/pipeline/tone/g064-plan.json', 'utf8'));
const L = (s) => [...(s ?? '')].length;
const out = { newAnswer: [], over200: [], newBlock: [], newQwarn: [], explEmpty: [], explCut: [], explainWarnNew: [], explainWarnOld: 0 };
for (const it of Object.values(p.items)) {
  const d = p.dbRows[it.id]; if (!d.is_active) continue;
  const q = it.question; const ans = [d.display_answer, ...d.variants];
  for (const a of ans) { const n = findAnswerInQuestion(q, a), o = findAnswerInQuestion(d.question_text, a); if (n === 'word' && o !== 'word') out.newAnswer.push({ id: it.id, a, q }); }
  if (L(q) > 200) out.over200.push({ id: it.id, n: L(q), old: L(d.question_text) });
  const hint = it.hint ?? endText(d.general_hint).out; const ex = it.explanation ?? endText(d.explanation).out;
  const ckN = checkHint({ hint, answer: d.display_answer, variants: d.variants, question: q, explanation: ex ?? '' });
  const ckO = checkHint({ hint: d.general_hint, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation ?? '' });
  if (ckN.block.length) out.newBlock.push({ id: it.id, lane: it.lane, block: ckN.block, oldBlock: ckO.block.length, hint, q });
  const qw = ckN.warn.find((w) => w.kind === 'question'); const qwo = ckO.warn.find((w) => w.kind === 'question');
  if (qw && !qwo) out.newQwarn.push({ id: it.id, lane: it.lane, share: qw.share, q, hint, ans: d.display_answer });
  const ew = ckN.warn.find((w) => w.kind === 'explain'), ewo = ckO.warn.find((w) => w.kind === 'explain');
  if (ew && !ewo) out.explainWarnNew.push({ id: it.id, shared: ew.shared }); else if (ew) out.explainWarnOld++;
  if (!ex || !ex.trim()) out.explEmpty.push(it.id);
  else if (!/[.!?)'"’”]\s*$/.test(ex) || L(ex) < 12) out.explCut.push({ id: it.id, ex });
}
for (const id of p.keep) { const d = p.dbRows[id]; const ex = d.explanation; if (!ex || !ex.trim()) out.explEmpty.push(id); else if (!/[.!?)'"’”]\s*$/.test(ex) || L(ex) < 12) out.explCut.push({ id, ex }); }
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])));
