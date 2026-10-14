import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const ga = Object.fromEntries(JSON.parse(fs.readFileSync(SC + '/ga.json', 'utf8')).map((x) => [String(x.id), x]));
const [a, b, ...pieces] = process.argv.slice(2); // a..b: slice of keys from file
const keys = JSON.parse(fs.readFileSync(R + '/_work/ok-sample-ga.json', 'utf8')).pick.slice(+a, +b);
const out = {}; for (const k of ['g1', 'g2', 'g3']) for (const x of JSON.parse(fs.readFileSync(`${R}/${k}.out.json`, 'utf8'))) out[x.key] = x;
for (const k of keys) { const g = ga[k], x = out[k];
  console.log(`#${k} [${g.answer}] ${x.doubt ? 'D ' : ''}\n  Q: ${g.question}\n  H: ${g.after}\n  ${g.sameAnswerActive.length ? 'SAME: ' + g.sameAnswerActive.map((s) => '#' + s.id + ' Q:' + s.question + ' E:' + s.explanation).join(' || ') + '\n  ' : ''}J: ${x.reason}${x.note ? ' /N: ' + x.note : ''}`); }
