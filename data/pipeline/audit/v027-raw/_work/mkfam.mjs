import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit', W = A + '/v027-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const T = J(A + '/v027-targets.json'); const items = Object.values(T.items).filter((x) => x.active);
const CAL = J(W + '/cal1.json');
let seed = 20261028; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sh = (a) => { const s = [...a]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
const firstSent = (e) => { const t = one(e); const m = t.match(/^.*?[.。!?](\s|$)/); return (m ? m[0] : t).slice(0, 140) || '(해설 없음)'; };
const base = sh(items.map((x, i) => ({ id: 1000 + i + 1, qid: x.id, answer: x.answer, topicKo: x.category.split(' > ')[0] || '', mid: x.category.split(' > ')[1] || '', first: firstSent(x.explanation) })));
const NF = 6, per = Math.ceil(base.length / NF); const map = {};
for (let i = 0; i < NF; i++) {
  const part = base.slice(i * per, (i + 1) * per); const name = 'f' + String(i + 1).padStart(2, '0');
  const mix = sh([...part, ...CAL.map((c) => ({ id: c.id, answer: c.answer, topicKo: c.topicKo, mid: c.mid, first: c.first, cal: true }))]);
  for (const x of part) map[x.id] = x.qid;
  fs.writeFileSync(`${W}/${name}.txt`, `## 정답 친숙도 조각 ${name} (${mix.length}건)\n\n` + mix.map((x) => `### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n한 줄 정체(구별용): ${x.first}\n`).join('\n'));
  fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(mix.map((x) => x.id)));
  const prompt = fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v026-raw/_work/f01.prompt.txt', 'utf8').replace(/v026-raw/g, 'v027-raw').replace(/f01/g, name).replace(/68/g, String(mix.length));
  fs.writeFileSync(`${W}/${name}.prompt.txt`, prompt);
}
fs.writeFileSync(W + '/fam.map.json', JSON.stringify(map));
console.log(base.length, per);
