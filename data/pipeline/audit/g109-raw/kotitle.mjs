// G109 — spelling: wiki 인 정답이 한국어 위키백과 제목(또는 넘겨주기)인지 한 번에 묻는다 → kotitle.txt
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const O = 'web-desk/tone/보낼것/'; const items = [];
for (const f of readdirSync(O).filter((f) => /^새재료-(1[6-9]|[23]\d)\.json$/.test(f))) for (const it of JSON.parse(readFileSync(O + f, 'utf8')).items) if (it.spelling !== 'dict') items.push([f.slice(4, -5), it.key, it.answer]);
const out = [];
for (let i = 0; i < items.length; i += 40) {
  const part = items.slice(i, i + 40);
  const u = 'https://ko.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=' + encodeURIComponent(part.map((x) => x[2]).join('|'));
  let j; for (let t = 0; t < 4; t++) { const r = await fetch(u, { headers: { 'User-Agent': 'quiz-research/1.0' } }); if (r.ok) { j = await r.json(); break; } await new Promise((s) => setTimeout(s, 20000)); }
  if (!j) { part.forEach((x) => out.push(`${x.join(' ')}\t?`)); continue; }
  const norm = new Map((j.query.normalized || []).map((x) => [x.from, x.to])), red = new Map((j.query.redirects || []).map((x) => [x.from, x.to]));
  const miss = new Set(Object.values(j.query.pages).filter((p) => 'missing' in p).map((p) => p.title));
  for (const x of part) { const t1 = norm.get(x[2]) || x[2]; const t2 = red.get(t1); out.push(`${x.join(' ')}\t${miss.has(t1) ? '없음' : t2 ? '넘겨주기 → ' + t2 : '제목'}`); }
}
writeFileSync('data/pipeline/audit/g109-raw/kotitle.txt', out.join('\n') + '\n');
console.log(out.filter((l) => !/\t제목$/.test(l)).join('\n')); console.log('계', out.length, '제목', out.filter((l) => /\t제목$/.test(l)).length);
