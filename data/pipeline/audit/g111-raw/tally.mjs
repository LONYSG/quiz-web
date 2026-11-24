// G111 — 새재료-35~ 의 등급별 수
import { readFileSync, readdirSync } from 'node:fs';
const O = 'web-desk/tone/보낼것/'; const t = {}; let n = 0;
for (const f of readdirSync(O).filter((f) => /^새재료-(3[5-9]|[4-9]\d)\.json$/.test(f)).sort()) { const j = JSON.parse(readFileSync(O + f, 'utf8')); const c = {}; for (const it of j.items) { t[it.gradeGuess] = (t[it.gradeGuess] || 0) + 1; c[it.gradeGuess] = (c[it.gradeGuess] || 0) + 1; n++; } console.log(f, JSON.stringify(c)); }
console.log('계', n, JSON.stringify(t));
