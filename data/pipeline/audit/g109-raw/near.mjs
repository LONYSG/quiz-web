// G109(G107 그대로 · 16~ 만) — 가까운 정답(한쪽이 다른 쪽을 품는 것 · 3글자 이상) 참고 목록
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { normalizeAnswer as n } from '../../../../shared/dist/normalize.js';
const act = [];
for (const l of readFileSync('data/pipeline/audit/g109-raw/answers.tsv','utf8').split('\n')) { const [id,a,d]=l.split('\t'); if (a==='1') act.push([+id, d, n(d)]); }
const O='web-desk/tone/보낼것/'; const out=[];
for (const f of readdirSync(O).filter(f=>/^새재료-(1[6-9]|[23]\d)\.json$/.test(f)).sort()) for (const it of JSON.parse(readFileSync(O+f,'utf8')).items) {
  const k=n(it.answer); if (k.length<2) continue;
  const hit=act.filter(([,,x])=>x.length>=2 && x!==k && (x.includes(k)||k.includes(x)) && Math.min(x.length,k.length)>=3);
  if (hit.length) out.push(`${f.slice(0,-5)}/${it.key} ${it.answer} ↔ ${hit.slice(0,4).map(([i,d])=>`#${i} ${d}`).join(' · ')}`);
}
writeFileSync('data/pipeline/audit/g109-raw/near.txt', out.join('\n')+'\n'); console.log(out.length); console.log(out.join('\n'));
