import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const I = JSON.parse(fs.readFileSync(A + '/v027-raw/_work/items.v027.json', 'utf8')); const T = JSON.parse(fs.readFileSync(A + '/v027-targets.json', 'utf8')).items;
const out = { a: [], b: [], c: [], d: [] };
for (const [id, r] of Object.entries(I)) { const h = r.human; if (!h.n) continue; const ms = h.fastestMs; const rm = Math.max(...h.rooms);
  if (r.v2 <= 2 && rm >= 3 && (ms == null || ms >= 25000)) out.a.push(id);          // 판정 쉬움인데 방이 초성 뒤/못 맞힘
  else if (r.v2 === 1 && (ms == null || ms >= 10000)) out.a.push(id);
  else if (r.v2 >= 4 && ms != null && ms < 10000) out.b.push(id);                    // 판정 어려움인데 방이 힌트 전에
  else if (r.v2 === 3 && ms != null && ms < 5000) out.c.push(id);
  else if (r.v2 === 5 && ms != null && ms < 25000) out.d.push(id); }
console.log('a(쉽다고 했는데 못/늦게)', out.a.length, 'b(어렵다고 했는데 힌트 전)', out.b.length, 'c(3인데 5초 안)', out.c.length, 'd(5인데 25초 안)', out.d.length);
fs.writeFileSync(A + '/v027-raw/_work/far2.json', JSON.stringify(out));
const show = (ids) => ids.map((i) => `${i}|v2=${I[i].v2}(지금${I[i].cur})|${T[i].answer}|ms=${I[i].human.fastestMs}|방${I[i].human.rooms.join(',')}|${I[i].tags.join(',')}|${T[i].question.slice(0, 60)}`).join('\n');
console.log('\n=== a'); console.log(show(out.a)); console.log('\n=== b'); console.log(show(out.b));
