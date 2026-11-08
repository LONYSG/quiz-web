import { readFileSync, writeFileSync } from 'node:fs';
const f = 'data/minigame/ox/items.json'; const raw = readFileSync(f, 'utf8'); const doc = JSON.parse(raw);
let ind = null; for (const i of [1, 2]) if (JSON.stringify(doc, null, i) + '\n' === raw) ind = i;
if (ind === null) { console.log('형식 불일치'); process.exit(1); }
const v = new Map(JSON.parse(readFileSync('data/pipeline/audit/v042-raw/_work/items-verify.json', 'utf8')).map((x) => [x.id, x]));
for (const it of doc.items) { const x = v.get(it.id); it.status = x.status; it.verify = x.verify; }
writeFileSync(f, JSON.stringify(doc, null, ind) + '\n'); console.log('written', doc.items.length, 'indent', ind);
