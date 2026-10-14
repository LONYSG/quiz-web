import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const ga = Object.fromEntries(JSON.parse(fs.readFileSync(SC + '/ga.json', 'utf8')).map((x) => [String(x.id), x]));
const q = JSON.parse(fs.readFileSync(SC + '/qrows.json', 'utf8'));
const mode = process.argv[2]; // fix | okamb | ok
for (const k of process.argv.slice(3)) {
  for (const x of JSON.parse(fs.readFileSync(`${R}/${k}.out.json`, 'utf8'))) {
    const g = ga[x.key]; const r = q[x.key] || {};
    const hint = g ? g.after : r.hint;
    const sel = mode === 'fix' ? x.verdict === 'fix' : mode === 'amb' ? (x.verdict === 'ok' && /^애매/.test(x.note || '')) : x.verdict === 'ok';
    if (!sel) continue;
    console.log(`#${x.key} [${r.answer || ''}] ${x.verdict} ${(x.categories || []).join(',')}${x.doubt ? ' D' : ''}\n  Q: ${r.question || ''}\n  NOW: ${hint}\n  WHY: ${x.reason}${x.note ? '\n  NOTE: ' + x.note : ''}${x.proposal?.hint ? '\n  PROP: ' + x.proposal.hint : ''}${(x.facts || []).filter((f) => f.proposal).length ? '\n  SRC: ' + x.facts.filter((f) => f.proposal).map((f) => f.result + ':' + f.source).join(' ; ') : ''}`);
  }
}
