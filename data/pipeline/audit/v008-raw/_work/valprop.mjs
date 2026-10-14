import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const q = J(SC + '/qrows.json'); const ga = Object.fromEntries(J(SC + '/ga.json').map((x) => [String(x.id), x]));
const na = Object.fromEntries(J(SC + '/na.json').map((x) => [x.key, x]));
const da = Object.fromEntries(J(SC + '/da-all.json').map((x) => [String(x.id), x]));
const ov = fs.existsSync(R + '/_work/ov.json') ? J(R + '/_work/ov.json') : {};
const grams = (s, n = 4) => { const out = new Set(); for (const run of (s || '').replace(/\s+/g, '').match(/[가-힣]+/g) || []) for (let i = 0; i + n <= run.length; i++) out.add(run.slice(i, i + n)); return out; };
const sameOf = (id) => { const g = ga[id]?.sameAnswerActive || na[id]?.sameAnswerActive; if (g) return g.map((s) => s.id); return (da[id]?.hits || []).map((h) => h.other); };
const bad = []; let n = 0;
for (const k of ['g1', 'g2', 'g3', 'n1', 'd1', 'd2', 'd3']) for (const x of J(`${R}/${k}.out.json`)) {
  if (x.verdict !== 'fix') continue;
  const key = x.key; const o = ov[key] ?? ov['n' + key];
  const hint = o && o.hint ? o.hint : x.proposal?.hint; if (!hint) { bad.push([key, 'NO-PROPOSAL']); continue; }
  const id = /^\d+$/.test(key) ? key : null; if (!id) continue;
  n++;
  const r = q[id]; const c = checkHint({ hint, answer: r.answer, variants: r.variants || [], question: r.question, explanation: r.explanation || '' });
  const probs = [];
  if (c.block.length) probs.push('BLOCK ' + JSON.stringify(c.block));
  if ([...hint].length > 120) probs.push('LEN ' + [...hint].length);
  if (/\n/.test(hint)) probs.push('NEWLINE');
  const hg = grams(hint);
  const own = [...grams(r.question + ' ' + (r.explanation || ''))].filter((g) => hg.has(g)).slice(0, 3);
  const oth = []; for (const oid of sameOf(Number(id))) { const o2 = q[oid]; if (!o2) continue; const og = grams((o2.question || '') + ' ' + (o2.explanation || '')); const hit = [...hg].filter((g) => og.has(g)); if (hit.length) oth.push(`#${oid}:${hit.slice(0, 2).join(',')}`); }
  if (own.length) probs.push('OWN-Q/E ' + own.join(','));
  if (oth.length) probs.push('OTHER ' + oth.join(' '));
  if (c.warn.length) probs.push('warn ' + c.warn.map((w) => w.kind).join(','));
  if (probs.length) bad.push([key, probs.join(' | ')]);
}
console.log('checked', n, 'with-issues', bad.length); for (const b of bad) console.log(b[0], b[1]);
