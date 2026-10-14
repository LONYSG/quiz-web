import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const q = JSON.parse(fs.readFileSync(SC + '/qrows.json', 'utf8'));
const ids = Object.keys(q);
const txt = (r) => (r.question || '') + ' ' + (r.hint || '');
const out = [];
const ok = (a) => (a || '').replace(/\s+/g, '').length >= 3;
for (let i = 0; i < ids.length; i++) { const A = q[ids[i]]; if (!ok(A.answer)) continue;
  for (let j = i + 1; j < ids.length; j++) { const B = q[ids[j]]; if (!ok(B.answer) || A.answer === B.answer) continue;
    if (txt(B).includes(A.answer) && txt(A).includes(B.answer)) out.push([ids[i], A.answer, ids[j], B.answer]); } }
console.log(out.length); fs.writeFileSync(SC + '/c66-scan.json', JSON.stringify(out));
for (const o of out.slice(0, 80)) console.log(o.join(' | '));
