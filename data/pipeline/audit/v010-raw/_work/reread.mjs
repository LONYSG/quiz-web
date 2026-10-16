import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v10';
const R = 'C:/work/quiz-web/data/pipeline/audit/v010-raw';
const t = Object.fromEntries(JSON.parse(fs.readFileSync(SC + '/targets.json', 'utf8')).map((x) => [x.id, x]));
const J = {}; for (let i = 1; i <= 8; i++) for (const x of JSON.parse(fs.readFileSync(`${R}/p${i}.out.json`, 'utf8'))) J[x.id] = { ...x, piece: 'p' + i };
const r2 = Object.fromEntries(JSON.parse(fs.readFileSync(R + '/r2.out.json', 'utf8')).map((x) => [x.id, x]));
const ids = Object.keys(J).map(Number);
const down = ids.filter((id) => J[id].dif < 4);
const split = Object.keys(r2).map(Number).filter((id) => (J[id].dif >= 4) !== (r2[id].dif >= 4));
let seed = 20261018; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const s = [...down].sort((a, b) => a - b); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
const down20 = s.slice(0, Math.round(down.length * 0.2)).sort((a, b) => a - b);
const list = [...new Set([...down20, ...split])].sort((a, b) => a - b);
fs.writeFileSync(R + '/_work/reread-ids.json', JSON.stringify({ down: down.length, down20, split, list }));
console.log('down', down.length, 'down20', down20.length, 'split', split.length, 'list', list.length, 'up(5)', ids.filter((id) => J[id].dif > 4).length);
const one = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();
const [a, b] = process.argv.slice(2);
for (const id of list.slice(+a, +b)) { const x = t[id], j = J[id], r = r2[id];
  console.log(`#${id} [${x.c3name}] cur=${x.dif} J=${j.dif}${j.edge ? '(e' + j.edge + ')' : ''}${r ? ' R2=' + r.dif + (r.edge ? '(e' + r.edge + ')' : '') : ''}${split.includes(id) ? ' SPLIT' : ''}\n  Q: ${one(x.question).slice(0, 230)}\n  A: ${x.answer}   E: ${one(x.explanation).slice(0, 80)}\n  J: ${one(j.easiestCue).slice(0, 90)} | ${one(j.difWhy).slice(-45)}${r ? '\n  R: ' + one(r.easiestCue).slice(0, 90) + ' | ' + one(r.difWhy).slice(-40) : ''}`); }
