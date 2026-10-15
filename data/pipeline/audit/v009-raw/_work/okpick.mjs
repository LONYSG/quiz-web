import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v9';
const R = 'C:/work/quiz-web/data/pipeline/audit/v009-raw';
const items = Object.fromEntries(JSON.parse(fs.readFileSync(SC + '/items.json', 'utf8')).map((x) => [x.ref, x]));
const all = []; for (let i = 1; i <= 8; i++) for (const x of JSON.parse(fs.readFileSync(`${R}/p${i}.out.json`, 'utf8'))) all.push(x);
const oks = all.filter((x) => x.verdict === 'ok');
let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const s = [...oks]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
const pick = s.slice(0, 32).map((x) => x.ref); fs.writeFileSync(R + '/_work/ok-sample.json', JSON.stringify(pick));
const one = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const [a, b] = process.argv.slice(2);
for (const ref of pick.slice(+a, +b)) { const x = all.find((y) => y.ref === ref); const t = items[ref];
  console.log(`#${ref} [${t.answer}] dif=${x.score.dif}${t.rewrite?.changed ? ' RW' : ''}${t.method === '가' ? ' 2회차' : ''}\n  Q: ${one(t.question).slice(0, 260)}\n  H: ${one(t.hint)}\n  cue: ${one(x.score.easiestCue).slice(0, 120)} | ${one(x.score.difWhy)}\n  J: ${one(x.reason).slice(0, 160)}${x.note ? ' /N: ' + one(x.note).slice(0, 120) : ''}`); }
