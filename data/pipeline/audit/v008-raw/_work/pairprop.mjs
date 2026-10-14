import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const q = J(SC + '/qrows.json'); const da = J(SC + '/da-all.json'); const ga = J(SC + '/ga.json'); const na = J(SC + '/na.json');
const ov = fs.existsSync(R + '/_work/ov.json') ? J(R + '/_work/ov.json') : {};
const newHint = new Map();
for (const k of ['g1', 'g2', 'g3', 'n1', 'd1', 'd2', 'd3']) for (const x of J(`${R}/${k}.out.json`)) if (x.verdict === 'fix') { const id = x.key.replace(/^g003-.*/, ''); if (!/^\d+$/.test(x.key)) continue;
  const o = ov[x.key] ?? ov['n' + x.key]; const h = o === null ? null : (o && o.hint) || x.proposal?.hint; if (h && !(k.startsWith('d') && newHint.has(x.key) && x.key === '3627')) newHint.set(x.key, h); if (x.key === '3627' && k === 'd3') newHint.set(x.key, h); }
const grams = (s, n = 5) => { const out = new Set(); for (const run of (s || '').replace(/\s+/g, '').match(/[가-힣]+/g) || []) for (let i = 0; i + n <= run.length; i++) out.add(run.slice(i, i + n)); return out; };
const pairs = new Set(); const out = [];
for (const d of da) for (const h of d.hits) { const a = String(d.id), b = String(h.other); const key = [a, b].sort().join('|'); if (pairs.has(key)) continue; pairs.add(key);
  const ha = newHint.get(a) ?? q[a]?.hint, hb = newHint.get(b) ?? q[b]?.hint; if (!ha || !hb) continue; if (!(newHint.has(a) || newHint.has(b))) continue;
  const A = grams(ha), B = grams(hb); const hit = [...A].filter((g) => B.has(g)); if (hit.length) out.push(`${a}↔${b} [${newHint.has(a) ? 'new' : 'old'}/${newHint.has(b) ? 'new' : 'old'}] ${hit.slice(0, 3).join(',')} || ${ha} || ${hb}`); }
console.log(out.length); for (const o of out) console.log(o);
