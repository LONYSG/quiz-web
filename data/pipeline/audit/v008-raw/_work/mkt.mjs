import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const q = J(SC + '/qrows.json'); const ga = Object.fromEntries(J(SC + '/ga.json').map((x) => [String(x.id), x]));
const na = Object.fromEntries(J(SC + '/na.json').map((x) => [x.key, x]));
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const pool = [];
for (const k of ['g1', 'g2', 'g3']) for (const x of J(`${R}/${k}.out.json`)) if (x.verdict === 'ok' && !x.webOpened && !x.doubt) pool.push({ key: x.key, set: 'g' });
for (const x of J(`${R}/n1.out.json`)) if (x.verdict === 'ok' && !x.webOpened && /^\d+$/.test(x.key)) pool.push({ key: x.key, set: 'n' });
for (const k of ['d1', 'd2', 'd3']) for (const x of J(`${R}/${k}.out.json`)) if (x.verdict === 'ok' && !x.webOpened) pool.push({ key: x.key, set: 'd' });
const seen = new Set(); const uniq = pool.filter((p) => !seen.has(p.key) && seen.add(p.key));
let seed = 20261016; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const sh = [...uniq]; for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
const pick = sh.slice(0, 40);
const fmt = (p) => { const r = q[p.key]; const src = p.set === 'g' ? ga[p.key].g002sources : p.set === 'n' ? na[p.key].sources : [];
  return `### #${p.key}\nA: ${r.answer}\nQ: ${one(r.question)}\nE: ${one(r.explanation)}\nH(검증 대상): ${one(r.hint)}\nsources(참고): ${(src || []).join(' ; ')}\n`; };
const half = (a, b) => pick.slice(a, b);
fs.writeFileSync(`${R}/_work/t1.txt`, half(0, 20).map(fmt).join('\n')); fs.writeFileSync(`${R}/_work/t1.refs.json`, JSON.stringify(half(0, 20).map((p) => p.key)));
fs.writeFileSync(`${R}/_work/t2.txt`, half(20, 40).map(fmt).join('\n')); fs.writeFileSync(`${R}/_work/t2.refs.json`, JSON.stringify(half(20, 40).map((p) => p.key)));
fs.writeFileSync(`${R}/_work/true40.json`, JSON.stringify(pick));
console.log('pool', pool.length, 'uniq', uniq.length, 'bySet', pick.reduce((m, p) => (m[p.set] = (m[p.set] || 0) + 1, m), {}));
// t3: 제안 새 사실 점검 — 표시된 14 + 무작위 6
const all = [];
for (const k of ['g1', 'g2', 'g3', 'n1', 'd1', 'd2', 'd3']) for (const x of J(`${R}/${k}.out.json`)) if (x.verdict === 'fix' && x.proposal?.hint) all.push({ k, x });
const flagged = new Set(['1581', '3426', '859', '3590', '858', '3445', '3407', '3565', '3604', '3656', '3984', '2079', '208', '3005']);
const fl = all.filter((a) => flagged.has(a.x.key));
const rest = all.filter((a) => !flagged.has(a.x.key) && !['3951', '3620', '3825', '455', '3693'].includes(a.x.key));
const sh2 = [...rest]; for (let i = sh2.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh2[i], sh2[j]] = [sh2[j], sh2[i]]; }
const t3 = fl.concat(sh2.slice(0, 8));
const fmt3 = (a) => { const r = q[a.x.key]; const fs3 = (a.x.facts || []).filter((f) => f.proposal).map((f) => `${f.claim} <${f.source}> (${f.result}/${f.basis})`).join(' || ');
  return `### #${a.x.key}\nA: ${r.answer}\nQ: ${one(r.question)}\n제안 힌트: ${a.x.proposal.hint}\n판정자가 단 근거: ${fs3}\n`; };
fs.writeFileSync(`${R}/_work/t3.txt`, t3.map(fmt3).join('\n')); fs.writeFileSync(`${R}/_work/t3.refs.json`, JSON.stringify(t3.map((a) => a.x.key)));
console.log('t3', t3.length, 'allProposals', all.length);
