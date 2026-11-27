// 시범 B: gpt 후보 → 겹침 기계 거르기 → 후보-NN-거른것.json  (node web-desk/newq/_cands.mjs 68)
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeAnswer } from '../../shared/dist/normalize.js';
process.chdir('C:/work/quiz-web');
const nn = process.argv[2]; const G = 'web-desk/newq/gpt/';
const n = (s) => normalizeAnswer(String(s ?? ''));
const taken = new Map();
for (const l of readFileSync('web-desk/newq/_taken.tsv', 'utf8').split('\n')) { if (!l) continue; const [s, , f] = l.split('\t'); for (const x of (f || '').split('|')) if (x) taken.set(n(x), s); }
for (const l of readFileSync(`web-desk/newq/보낼것/조각-${nn}.txt`, 'utf8').split('\n')) { const m = l.match(/^\s+· [^:]+: (.+)$/); if (m) for (const x of m[1].split(' · ')) taken.set(n(x.replace(/\(.*\)$/, '')), '조각 목록'); }
const raw = readFileSync(G + `후보-${nn}.txt`, 'utf8'); const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const keep = [], cut = [];
for (const c of j.cands) { const hit = [c.answer, ...(c.also || [])].map((x) => taken.get(n(x))).find(Boolean); (hit ? cut : keep).push(hit ? `${c.answer} ← ${hit}` : c); }
writeFileSync(G + `후보-${nn}-거른것.json`, JSON.stringify({ done: true, chunk: nn, cands: keep, cut }, null, 1) + '\n');
console.log(`후보 ${j.cands.length} · 남김 ${keep.length} · 겹침 ${cut.length}${cut.length ? ' — ' + cut.join(' / ') : ''}`);
