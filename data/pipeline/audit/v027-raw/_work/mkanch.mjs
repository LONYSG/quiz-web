import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const I = JSON.parse(fs.readFileSync(A + '/v027-raw/_work/items.v027.json', 'utf8')); const T = JSON.parse(fs.readFileSync(A + '/v027-targets.json', 'utf8')).items;
const anc = new Set(JSON.parse(fs.readFileSync(A + '/v027-raw/_work/anchors52.json', 'utf8')).map((a) => String(a.id)));
const evid = (r) => { const h = r.human, ms = h.fastestMs, rm = Math.max(...h.rooms); if (!h.n) return null;
  if (r.v2 === 1) return ms != null && ms < 4000 && rm >= 4;
  if (r.v2 === 2) return ms != null && ms >= 5000 && ms < 10000 && rm >= 4;
  if (r.v2 === 3) return ms != null && ms >= 12000 && ms < 25000 && rm >= 4;
  if (r.v2 === 4) return ms != null && ms >= 25000 && rm >= 4;
  if (r.v2 === 5) return ms == null && rm >= 4; };
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const quota = { 1: 3, 2: 4, 3: 5, 4: 5, 5: 3 }; const picks = []; const usedMid = new Set();
for (const g of [1, 2, 3, 4, 5]) { const c = Object.keys(I).filter((i) => !anc.has(i) && I[i].v2 === g && evid(I[i]) && I[i].confidence !== 'low' && I[i].flags.read.grade === 'a' && !I[i].flags.unique?.flag && !I[i].flags.fact?.flag).sort(() => rnd() - 0.5);
  let k = 0; for (const i of c) { const mid = T[i].category.split(' > ').slice(0, 2).join('>'); if (usedMid.has(mid) && k >= 0 && !(g >= 4)) continue; usedMid.add(mid); if (picks.includes(i)) continue; picks.push(i); if (++k >= quota[g]) break; } }
const out = picks.map((i) => ({ id: +i, v2: I[i].v2, answer: T[i].answer, question: T[i].question, why: I[i].why, human: { fastestMs: I[i].human.fastestMs, rooms: I[i].human.rooms, solved: I[i].human.solved }, cat: T[i].category }));
fs.writeFileSync(A + '/v027-anchors2.json', JSON.stringify({ note: '2라운드 보정 예 20 — 판정자 v2 가 사람 결과와 맞은 것(1: 4초 안 · 2: 5~10초 · 3: 일반 힌트 뒤 12~25초 · 4: 25초↑ · 5: 못 맞힘 방 5명↑) · 눈금자 52(62) 금 표본과 별개', items: out, readingExamples: [] }, null, 1));
for (const o of out) console.log(o.v2, o.id, o.answer, '|', o.human.fastestMs, o.human.rooms.join(','), '|', o.why.slice(0, 50));
console.log(out.length);
