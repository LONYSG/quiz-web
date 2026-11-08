import { readFileSync, writeFileSync } from 'node:fs';
const items = JSON.parse(readFileSync('data/minigame/ox/items.json', 'utf8')).items;
const L1 = ['한국', '인문·사회', '자연과학', '기술·의학', '문화·예술', '스포츠·게임', '생활·상식'];
const ids = { 한국: 'kr', '인문·사회': 'hs', 자연과학: 'sc', '기술·의학': 'tm', '문화·예술': 'ar', '스포츠·게임': 'sp', '생활·상식': 'lf' };
const byId = new Map(items.map((i) => [i.id, i]));
for (const l1 of L1) {
  const arr = items.filter((i) => i.category.l1 === l1);
  // grade 표본 10: grade 별 비례(1:4 · 2:4 · 3:2) 앞에서부터 고르게
  const pick = [];
  for (const [g, n] of [[1, 4], [2, 4], [3, 2]]) { const a = arr.filter((i) => i.grade === g); const step = a.length / n; for (let k = 0; k < n; k++) pick.push(a[Math.floor(k * step + step / 2)].id); }
  const rows = arr.map((i) => ({ id: i.id, statement: i.statement, answer: i.answer, explanation: i.explanation, l1: i.category.l1, l2: i.category.l2, grade: i.grade, trap: i.trap, pairId: i.pairId, pairWith: i.pairId ? items.filter((j) => j.pairId === i.pairId && j.id !== i.id).map((j) => j.id + ':' + j.statement) : undefined, factClaim: i.factClaim, basis: i.sources.map((s) => s.basis + ' ' + s.url + ' — ' + s.note), gradeSample: pick.includes(i.id) }));
  writeFileSync(`data/pipeline/audit/v042-raw/_work/in/${ids[l1]}.json`, JSON.stringify(rows, null, 1));
  console.log(l1, ids[l1], arr.length, 'knowledge', arr.filter((i) => i.sources.every((s) => s.basis === 'knowledge')).length, 'sample', pick.length);
}
