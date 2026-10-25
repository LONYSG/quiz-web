// V028 친숙도 조각(f01~) — 지금 ≤2 인 893 + 기존 값 없는 1 / 나머지는 기존 값을 source 로 옮김 (fin 단계)
import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit', W = A + '/v028-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const T = J(A + '/v028-targets.json').items;
const v22 = J(A + '/v022-familiarity.json').items, v23 = J(A + '/v023-familiarity.json').items;
const g = [...J(A + '/v025-results.json').familiarity2.rows.map((r) => ({ ...r, src: 'V025' })), ...J(A + '/v026-results.json').familiarity2.rows.map((r) => ({ ...r, src: 'V026' }))];
const byAns = {}; for (const r of g) (byAns[r.answer] ||= []).push(r);
const need = []; const old = {};
for (const [id, t] of Object.entries(T)) {
  if (t.curDif <= 2) { need.push(t); continue; }
  if (v22[id]) { old[id] = { familiarity: v22[id].familiarity, pct: v22[id].pct, why: v22[id].why, source: 'V022' }; continue; }
  if (v23[id]) { old[id] = { familiarity: v23[id].familiarity, pct: v23[id].pct, why: v23[id].why, source: 'V023' }; continue; }
  const c = byAns[t.answer]; if (c && c.length === 1) { const r = c[0]; old[id] = { familiarity: r.second, pct: r.secondPct, why: r.why, source: r.src }; continue; }
  need.push(t);
}
fs.writeFileSync(W + '/fam.old.json', JSON.stringify(old));
const CAL = J(A + '/v027-raw/_work/cal1.json');
let seed = 20261030; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sh = (a) => { const s = [...a]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
const firstSent = (e) => { const t = one(e); const m = t.match(/^.*?[.。!?](\s|$)/); return (m ? m[0] : t).slice(0, 140) || '(해설 없음)'; };
const base = sh(need.map((x, i) => ({ id: 1000 + i + 1, qid: x.id, answer: x.answer, topicKo: x.category.split(' > ')[0] || '', mid: x.category.split(' > ')[1] || '', first: firstSent(x.explanation) })));
const NF = 6, per = Math.ceil(base.length / NF); const map = {};
const tmpl = fs.readFileSync(A + '/v027-raw/_work/f01.prompt.txt', 'utf8');
for (let i = 0; i < NF; i++) {
  const part = base.slice(i * per, (i + 1) * per); const name = 'f' + String(i + 1).padStart(2, '0');
  const mix = sh([...part, ...CAL.map((c) => ({ id: c.id, answer: c.answer, topicKo: c.topicKo, mid: c.mid, first: c.first, cal: true }))]);
  for (const x of part) map[x.id] = x.qid;
  fs.writeFileSync(`${W}/${name}.txt`, `## 정답 친숙도 조각 ${name} (${mix.length}건)\n\n` + mix.map((x) => `### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n한 줄 정체(구별용): ${x.first}\n`).join('\n'));
  fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(mix.map((x) => x.id)));
  fs.writeFileSync(`${W}/${name}.prompt.txt`, tmpl.replace(/v027-raw/g, 'v028-raw').replace(/f01/g, name).replace(/174/g, String(mix.length)));
}
fs.writeFileSync(W + '/fam.map.json', JSON.stringify(map));
console.log('need', need.length, 'old', Object.keys(old).length, 'per', per);
