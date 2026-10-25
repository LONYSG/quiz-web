import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const I = JSON.parse(fs.readFileSync(A + '/v027-raw/_work/items.v027.json', 'utf8')); const T = JSON.parse(fs.readFileSync(A + '/v027-targets.json', 'utf8')).items;
const sq = (s) => s.replace(/[\s·\-]/g, '');
const rows = []; let leak = [], long = [], nolast = [], numChange = [];
for (const [id, r] of Object.entries(I)) { const rd = r.flags.read; if (rd.grade === 'a') continue; const p = rd.proposal || ''; const t = T[id];
  const forms = [t.answer, ...(t.variants || [])].filter((x) => x.length >= 2); const hit = forms.filter((f) => sq(p).includes(sq(f)));
  const hitOrig = forms.filter((f) => sq(t.question).includes(sq(f)));
  if (hit.length && !hitOrig.length) leak.push([id, t.answer, hit.join('/')]);
  if (p.length > 200) long.push([id, p.length, rd.qlenOver]);
  if (!/[?？]\s*$/.test(p.trim()) && !/(은|는|인가요|일까요|입니까|합니까|무엇인가요)\??$/.test(p.trim())) nolast.push([id, p.slice(-30)]);
  const nums = (s) => (s.match(/\d+/g) || []).sort().join(','); const dropped = (t.question.match(/\d+/g) || []).filter((n) => !(p.match(/\d+/g) || []).includes(n)); const added = (p.match(/\d+/g) || []).filter((n) => !(t.question.match(/\d+/g) || []).includes(n)); if (added.length) numChange.push([id, 'added', added.join(',')]);
  rows.push({ id, grade: rd.grade, len: p.length, orig: t.question.length }); }
console.log('b/c', rows.length, 'leak(제안에 정답 새로 등장)', leak.length, JSON.stringify(leak)); console.log('200자 초과', long.length, JSON.stringify(long)); console.log('끝이 묻는 문장 아님?', nolast.length, JSON.stringify(nolast.slice(0, 12))); console.log('새 숫자 추가', numChange.length, JSON.stringify(numChange));
const lens = rows.map((r) => r.len - r.orig); console.log('길이 증감 평균', (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(0), '줄어든 것', lens.filter((x) => x < 0).length);
fs.writeFileSync('rchk.json', JSON.stringify({ leak, long, nolast, numChange }));
