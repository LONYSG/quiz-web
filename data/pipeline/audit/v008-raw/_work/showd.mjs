import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const q = JSON.parse(fs.readFileSync(SC + '/qrows.json', 'utf8'));
const da = Object.fromEntries(JSON.parse(fs.readFileSync(SC + '/da-all.json', 'utf8')).map((x) => [x.id, x]));
const [piece, mode, a, b] = process.argv.slice(2);
const arr = JSON.parse(fs.readFileSync(`${R}/${piece}.out.json`, 'utf8')).filter((x) => mode === 'all' || (mode === 'fix' ? x.verdict === 'fix' : x.verdict === 'ok')).slice(+a, +b);
for (const x of arr) { const r = q[x.key];
  console.log(`#${x.key} [${r.answer}] ${x.verdict} ${(x.categories || []).join(',')}${x.c66 ? ' C66' : ''}\n  H: ${r.hint}\n  J: ${x.reason}\n  SF: ${x.sameFact}${x.hintHint ? '\n  HH: ' + x.hintHint : ''}${x.note ? '\n  N: ' + x.note : ''}${x.proposal?.hint ? '\n  P: ' + x.proposal.hint : ''}`);
  for (const h of da[x.key].hits.slice(0, 2)) { const o = q[h.other]; console.log(`  >#${h.other} Q: ${o.question.slice(0,80)} | E: ${(o.explanation||"").slice(0,80)}`); } }
