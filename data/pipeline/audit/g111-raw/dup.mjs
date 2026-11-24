// G111 겹침 대조 — node data/pipeline/audit/g111-raw/dup.mjs "후보1" "후보1의 다른 표기" "후보2" …
//   같음(정규화 같음) = 버린다(활성 · 꺼진 것 · 새재료 · vstock 모두) · 가까움(한쪽이 다른 쪽을 품음 · 3글자+) = 참고
import { readFileSync } from 'node:fs';
import { normalizeAnswer as n } from '../../../../shared/dist/normalize.js';
const rows = readFileSync('data/pipeline/audit/g111-raw/taken.tsv', 'utf8').split('\n').filter(Boolean).map((l) => { const [s, d, , k] = l.split('\t'); return [s, d, (k || '').split('|').filter(Boolean)]; });
for (const q of process.argv.slice(2)) {
  const k = n(q); if (!k) continue;
  const same = rows.filter(([, , ks]) => ks.includes(k));
  if (same.length) { console.log(`✗ 같음  ${q}  ←  ${same.slice(0, 3).map(([s, d]) => `${s} ${d}`).join(' · ')}`); continue; }
  const near = k.length >= 3 ? rows.filter(([, , ks]) => ks.some((x) => x.length >= 3 && x !== k && (x.includes(k) || k.includes(x)))) : [];
  console.log(near.length ? `△ 가까움 ${q}  ~  ${near.slice(0, 3).map(([s, d]) => `${s} ${d}`).join(' · ')}` : `○ 없음  ${q}`);
}
