import { readFileSync, writeFileSync } from 'node:fs';
const f = 'data/minigame/song/items.json';
const raw = readFileSync(f, 'utf8');
const doc = JSON.parse(raw);
if (JSON.stringify(doc, null, 1) + '\n' !== raw) { console.log('형식 불일치 — 중단'); process.exit(1); }
const v = new Map(JSON.parse(readFileSync('data/pipeline/audit/v041-raw/_work/items-verify.json', 'utf8')).map((x) => [x.id, x]));
let n = 0;
for (const it of doc.items) { const x = v.get(it.id); if (!x) throw new Error('없음 ' + it.id); it.status = x.status; it.verify = x.verify; n++; }
writeFileSync(f, JSON.stringify(doc, null, 1) + '\n');
console.log('written', n);
