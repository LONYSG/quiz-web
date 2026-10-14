import fs from 'node:fs';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
let seed = 20261015; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const all = [];
for (const k of ['g1', 'g2', 'g3']) for (const x of JSON.parse(fs.readFileSync(`${R}/${k}.out.json`, 'utf8'))) all.push(x);
const oks = all.filter((x) => x.verdict === 'ok');
const amb = oks.filter((x) => /^애매/.test(x.note || ''));
const pool = oks.map((x) => x.key).sort((a, b) => a - b); const sh = [...pool];
for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
const pick = sh.slice(0, 43).sort((a, b) => a - b);
fs.writeFileSync(R + '/_work/ok-sample-ga.json', JSON.stringify({ n: all.length, ok: oks.length, amb: amb.length, pick }));
console.log(all.length, oks.length, amb.length, pick.length);
