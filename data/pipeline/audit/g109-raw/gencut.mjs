// G109 — GEN 판단으로 뺀다: node gencut.mjs NN key "까닭" [key "까닭" …]   (새재료-NN 에서 빼고 cut-NN 에 적는다)
import { readFileSync, writeFileSync } from 'node:fs';
const [nn, ...rest] = process.argv.slice(2); const P = `web-desk/tone/보낼것/새재료-${nn}.json`, C = `data/pipeline/audit/g109-raw/cut-${nn}.json`;
const j = JSON.parse(readFileSync(P, 'utf8')), c = JSON.parse(readFileSync(C, 'utf8'));
for (let i = 0; i < rest.length; i += 2) { const k = rest[i], w = rest[i + 1]; const it = j.items.find((x) => x.key === k); if (!it) { console.log('없음', k); continue; }
  j.items = j.items.filter((x) => x.key !== k); c.cut.push({ key: k, answer: it.answer, why: ['GEN: ' + w] }); console.log('뺌', k, it.answer, w); }
writeFileSync(P, JSON.stringify(j, null, 1) + '\n'); writeFileSync(C, JSON.stringify(c, null, 1) + '\n'); console.log('남음', j.items.length);
