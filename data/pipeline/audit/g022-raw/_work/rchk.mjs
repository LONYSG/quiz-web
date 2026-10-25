// G022 기계 검사 — 읽기 ⓑⓒ 제안 전수: 정답·변형 글자 새로 등장 · 200/240자 · 끝 문장 · 새 숫자
import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const M = JSON.parse(fs.readFileSync(A + '/g022-raw/_work/merged.json', 'utf8')).res; const T = JSON.parse(fs.readFileSync(A + '/g022-raw/targets.json', 'utf8')).items;
const sq = (s) => String(s).replace(/[\s·\-]/g, '').toLowerCase();
const leak = [], over200 = [], over240 = [], nolast = [], numAdded = []; let n = 0;
for (const [id, r] of Object.entries(M)) { const rd = r.read; if (rd.grade === 'a') continue; n++; const p = rd.proposal || ''; const t = T[id];
  const forms = [t.answer, ...(t.variants || [])].filter((x) => [...x].length >= 2);
  const hit = forms.filter((f) => sq(p).includes(sq(f)) && !sq(t.question).includes(sq(f)));
  if (hit.length) leak.push([+id, t.answer, hit.join('/')]);
  const L = [...p].length; if (L > 200) over200.push([+id, L, !!rd.qlenOver]); if (L > 240) over240.push([+id, L]);
  if (!/[?？]\s*$/.test(p.trim()) && !/(은|는|인가요|일까요|입니까|합니까|무엇인가요)\??$/.test(p.trim())) nolast.push([+id, p.slice(-25)]);
  const added = (p.match(/\d+/g) || []).filter((x) => !(t.question.match(/\d+/g) || []).includes(x)); if (added.length) numAdded.push([+id, added.join(',')]); }
const out = { n, leak, over200, over240, nolast, numAdded };
fs.writeFileSync('rchk.json', JSON.stringify(out));
console.log('b/c', n, 'leak', leak.length, 'over200', over200.length, 'over240', over240.length, 'nolast', nolast.length, 'numAdded', numAdded.length);
console.log(JSON.stringify(leak.slice(0, 30)));
