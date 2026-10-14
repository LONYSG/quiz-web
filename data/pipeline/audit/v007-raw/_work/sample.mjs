// 판정자 ok 10% 무작위 재독 표본 (경계 ok 는 이미 읽었으므로 제외) + 웹 안 연 사실 무작위 60 표본 — 고정 시드
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v007-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = new Map(J(SC + '/items.json').map((x) => [x.ref, x]));
const which = process.argv[2] || 'ok';
let seed = 20261015; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const recs = [];
for (let i = 1; i <= 7; i++) { const f = `${RAW}/j${i}.out.json`; if (fs.existsSync(f)) for (const r of J(f)) recs.push({ ...r, _piece: 'j' + i }); }
const ov = {};
for (let i = 1; i <= 7; i++) { const f = `${RAW}/_work/ov-j${i}.json`; if (fs.existsSync(f)) Object.assign(ov, J(f)); }
const effV = (r) => (ov[r.ref]?.verdict) || r.verdict;
if (which === 'ok') {
  const oks = recs.filter((r) => effV(r) === 'ok' && r.verdict === 'ok' && items.get(r.ref).selfJudge === '좋은 어려움' && !ov[r.ref]);
  const n = Math.ceil(recs.filter((r) => r.verdict === 'ok').length * 0.10);
  const pick = shuffle(oks).slice(0, n).sort((a, b) => (a.ref < b.ref ? -1 : 1));
  fs.writeFileSync(SC + '/oksample-refs.json', JSON.stringify(pick.map((r) => r.ref)));
  console.log('판정자 ok 총', recs.filter((r) => r.verdict === 'ok').length, '경계 아닌 ok 후보', oks.length, '표본', pick.length);
  console.log(pick.map((r) => r.ref).join(','));
} else {
  // 웹 안 연 항목(webOpened=false 이고 재채점 난이도 3 이하) 의 GEN facts 중 무작위
  const pool = [];
  for (const r of recs) {
    if (r.webOpened) continue;
    const x = items.get(r.ref);
    for (const f of x.facts) pool.push({ ref: r.ref, claim: f.claim, where: f.where, url: f.url, answer: x.answer, dif: r.score?.dif });
  }
  const refsInPool = new Set(pool.map((p) => p.ref));
  // 항목 단위로 60 (주장 전부 확인)
  const refs = shuffle([...refsInPool]).slice(0, 60).sort();
  fs.writeFileSync(SC + '/t60-refs.json', JSON.stringify(refs));
  console.log('웹 안 연 항목', refsInPool.size, '표본 항목', refs.length);
}
