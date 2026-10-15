import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v9';
const R = 'C:/work/quiz-web/data/pipeline/audit/v009-raw';
const items = Object.fromEntries(JSON.parse(fs.readFileSync(SC + '/items.json', 'utf8')).map((x) => [x.ref, x]));
const [piece, a, b] = process.argv.slice(2);
const one = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const arr = JSON.parse(fs.readFileSync(`${R}/${piece}.out.json`, 'utf8')).filter((x) => x.verdict !== 'ok').slice(+a, +b);
for (const x of arr) { const t = items[x.ref]; const p = x.proposal || {};
  console.log(`#${x.ref} [${t.answer}] ${x.verdict} ${(x.categories || []).join(',')} dif=${x.score.dif}${t.rewrite?.changed ? ' RW' : ''}${t.method === '가' ? ' 2회차' : ''}\n  H: ${one(t.hint)}\n  WHY: ${one(x.reason)}${x.note ? ' /N: ' + one(x.note).slice(0, 220) : ''}`);
  for (const k of ['question', 'explanation', 'hint']) if (p[k]) console.log(`  P.${k}: ${one(p[k])}`);
  if (p.variants) console.log('  P.variants: ' + JSON.stringify(p.variants));
  const pf = (x.facts || []).filter((f) => f.proposal); if (pf.length) console.log('  SRC: ' + pf.map((f) => f.result + '/' + f.basis).join(' ; '));
}
