// G111 — 마지막 대조: 새재료-35~ 의 모든 표기를 DB · 01~34 · vstock · 영상 · 서로와 한 번 더
import { readFileSync, readdirSync } from 'node:fs';
import { normalizeAnswer as n } from '../../../../shared/dist/normalize.js';
const mine = (s) => /^새재료-(3[5-9]|[4-9]\d)\//.test(s);
const other = new Map();
for (const l of readFileSync('data/pipeline/audit/g111-raw/taken.tsv', 'utf8').split('\n')) { if (!l) continue; const [s, d, , k] = l.split('\t'); if (mine(s)) continue; for (const x of (k || '').split('|')) if (x) other.set(x, `${s} ${d}`); }
const O = 'web-desk/tone/보낼것/'; const seen = new Map(); let bad = 0, all = 0;
for (const f of readdirSync(O).filter((f) => /^새재료-(3[5-9]|[4-9]\d)\.json$/.test(f)).sort()) for (const it of JSON.parse(readFileSync(O + f, 'utf8')).items) { all++;
  for (const s of [it.answer, ...(it.also || [])]) { const k = n(s); if (!k) continue; const o = other.get(k); if (o) { bad++; console.log('DB/앞', f, it.key, it.answer, `(${s}) ←`, o); } const p = seen.get(k); if (p && p !== it.key) { bad++; console.log('서로', f, it.key, it.answer, `(${s}) ←`, p); } seen.set(k, it.key); } }
console.log('재료', all, '겹침', bad);
