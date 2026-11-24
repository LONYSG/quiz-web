// G111 — GEN 판단으로 등급만 고친다: node regrade.mjs NN "정답" 등급 "까닭" […]   (새재료-NN 안에서 · cut 아님)
import { readFileSync, writeFileSync } from 'node:fs';
const [nn, ...r] = process.argv.slice(2); const P = `web-desk/tone/보낼것/새재료-${nn}.json`; const j = JSON.parse(readFileSync(P, 'utf8'));
for (let i = 0; i < r.length; i += 3) { const it = j.items.find((x) => x.answer === r[i]); if (!it) { console.log('없음', r[i]); continue; }
  console.log(nn, it.key, it.answer, it.gradeGuess, '→', +r[i + 1], r[i + 2]); it.gradeGuess = +r[i + 1]; it.care = (it.care ? it.care + ' · ' : '') + `GEN: 등급 ${r[i + 1]}로 고침(${r[i + 2]})`; }
writeFileSync(P, JSON.stringify(j, null, 1) + '\n');
