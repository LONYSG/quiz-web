// G109 — 겹침 대조용 목록: DB 정답(활성 + 꺼진 것 · 받는 표기) + 새재료-01~ 누적 + vstock 후보
//   열: 출처 · 표시 정답 · 받는 표기들(|) · 정규화 꼴들(|)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { normalizeAnswer as n } from '../../../../shared/dist/normalize.js';
const D = 'data/pipeline/audit/g109-raw/', O = 'web-desk/tone/보낼것/', V = 'web-desk/vstock/받은것/';
const rows = [];
for (const l of readFileSync(D + 'answers.tsv', 'utf8').split('\n')) { if (!l) continue; const [id, a, d, v] = l.split('\t'); const f = [d, ...(v || '').split('|')].filter(Boolean); rows.push([`db#${id}${a === '1' ? '' : '(꺼짐)'}`, d, f]); }
for (const f of readdirSync(O).filter((f) => /^새재료-\d+\.json$/.test(f)).sort()) for (const it of JSON.parse(readFileSync(O + f, 'utf8')).items) rows.push([`${f.slice(0, -5)}/${it.key}`, it.answer, [it.answer, ...(it.also || [])]]);
for (const f of readdirSync(V).filter((f) => f.endsWith('.json'))) for (const it of JSON.parse(readFileSync(V + f, 'utf8')).items || []) rows.push([`vstock/${f}`, it.answer, [it.answer, ...(it.altSpelling || [])]]);
writeFileSync(D + 'taken.tsv', rows.map(([s, d, f]) => `${s}\t${d}\t${f.join('|')}\t${[...new Set(f.map(n).filter(Boolean))].join('|')}`).join('\n') + '\n');
console.log('taken rows', rows.length);
