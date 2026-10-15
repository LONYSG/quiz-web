import fs from 'node:fs';
const items = JSON.parse(fs.readFileSync(process.env.V9SC + '/items.json', 'utf8'));
let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr, n) => { const s = [...arr].sort(() => rnd() - 0.5); return s.slice(0, n); };
const K = items.filter((x) => x.topic === 'korea');
const sel = [
  ...pick(K.filter((x) => x.rewrite?.changed === true), 1), ...pick(K.filter((x) => x.rewrite?.changed === false), 1), ...pick(K.filter((x) => !x.rewrite), 1),
  ...pick(items.filter((x) => x.topic === 'media' && x.score.wor === 2), 1), ...pick(items.filter((x) => x.topic === 'media' && x.score.wor === 3), 1),
  ...pick(items.filter((x) => x.rewrite?.changed === true && x.topic !== 'korea' && x.topic !== 'media'), 2),
  ...pick(items.filter((x) => x.method === '가'), 1), ...pick(items.filter((x) => x.topic === 'sports' && !x.rewrite), 1),
];
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
for (const x of sel) console.log(`### ${x.ref} [${x.topic}/${x.sub}] m=${x.method}${x.layer ? ' ' + x.layer : ''}\nQ: ${one(x.question)}\nA: ${x.answer}${x.variants?.length ? ' var:' + x.variants.join('|') : ''}\nE: ${one(x.explanation)}\nH: ${one(x.hint)}\n${x.rewrite?.changed ? 'BEFORE: ' + one(x.rewrite.before) + ' | added: ' + one(x.rewrite.addedCue) : x.rewrite ? 'NOCHANGE: ' + one(x.rewrite.why) : ''}\n${x.paired ? 'R1 #' + x.paired.id + ': ' + one(x.paired.question) : ''}\nfacts: ${x.facts.map((f) => one(f.claim).slice(0, 60)).join(' | ')}\n`);
fs.writeFileSync(process.env.V9SC + '/calib.json', JSON.stringify(sel.map((x) => x.ref)));
