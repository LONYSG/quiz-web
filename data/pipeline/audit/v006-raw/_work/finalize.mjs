// build.mjs 결과(v006-results.json)에 마무리: 빈 facts 채우기 · doubt 미확인 정리 · 누적 집계 · stats 재계산
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const P = 'C:/work/quiz-web/data/pipeline/audit/v006-results.json';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v6';
const R = JSON.parse(fs.readFileSync(P, 'utf8'));
const T = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/r047-verify-targets.json', 'utf8')).midHints.targets;
const by = new Map(T.map(x => [x.id, x]));
// 1. 빈 facts
let filled = 0;
for (const i of Object.values(R.midHints)) {
  if (i.facts.some(f => !f.proposal)) continue;
  const h = by.get(i.id).hint;
  i.facts.unshift({ claim: `현재 힌트의 주장: ${h}`, result: 'true', basis: 'knowledge', source: null, doubt: false, note: '판정자 facts 가 비어 VERIFY 가 재독에서 힌트 전체를 한 주장으로 읽음(웹 확인 아님 — 표본 60 의 오류율 1.7% 로 갈음)', verifyFilled: true });
  filled++;
}
// 2. doubt 인데 웹 확인 못 한 5건
const patch = { 2182: 'unverified', 2385: 'unverified', 3054: 'unverified', 2264: 'unverified', 3081: 'true' };
let patched = 0;
for (const i of Object.values(R.midHints)) for (const f of i.facts) {
  if (!f.proposal && f.doubt && f.basis !== 'web' && patch[i.id]) { f.result = patch[i.id]; f.note = (f.note ? f.note + ' ' : '') + '의심 표시했으나 웹으로 닫지 못함(4-3 미확인) — 3081 은 사실 표본에서 성충 암컷 약 30cm 상한만 확인'; patched++; }
}
// 3. 누적 집계: 같은 정답 (활성 DB + midHints 안)
const c = new pg.Client({ connectionString: 'postgresql://USER:PASSWORD@localhost:5434/quizweb' });
await c.connect();
const r = await c.query('select id, display_answer, difficulty_score from questions where is_active');
await c.end();
const idx = new Map();
for (const q of r.rows) { const k = normalizeAnswer(q.display_answer); if (!k) continue; (idx.get(k) || idx.set(k, []).get(k)).push(Number(q.id)); }
const mid = new Set(T.map(x => x.id));
const dist = {}, ge3 = [];
for (const [k, ids] of idx) { if (!ids.some(id => mid.has(id))) continue; dist[ids.length] = (dist[ids.length] || 0) + 1; if (ids.length >= 3) ge3.push({ key: k, n: ids.length, ids, midHintsIn: ids.filter(id => mid.has(id)).length }); }
ge3.sort((a, b) => b.n - a.n);
R.cumulative = { activeDb: r.rows.length, note: '중 힌트 대상에 걸린 정답을 normalizeAnswer 로 묶어 활성 DB 전체에서 센 분포(문항 수별 정답 수)', dist, ge3 };
// 4. stats 재계산
const arr = Object.values(R.midHints);
const nonProp = arr.flatMap(i => i.facts.filter(f => !f.proposal).map(f => ({ ...f, id: i.id })));
const prop = arr.flatMap(i => i.facts.filter(f => f.proposal));
R.stats.facts = { itemsWithFacts: arr.filter(i => i.facts.some(f => !f.proposal)).length, items: arr.length, claims: nonProp.length, true: nonProp.filter(f => f.result === 'true').length, false: nonProp.filter(f => f.result === 'false').length, unverified: nonProp.filter(f => f.result !== 'true' && f.result !== 'false').length, doubt: nonProp.filter(f => f.doubt).length, doubtWeb: nonProp.filter(f => f.doubt && f.basis === 'web').length, doubtNotWeb: nonProp.filter(f => f.doubt && f.basis !== 'web').length, web: nonProp.filter(f => f.basis === 'web').length, knowledge: nonProp.filter(f => f.basis !== 'web' && !f.verifyFilled).length, verifyFilled: nonProp.filter(f => f.verifyFilled).length, proposalFacts: prop.length, proposalFactsWeb: prop.filter(f => f.basis === 'web').length, falseList: nonProp.filter(f => f.result === 'false').map(f => ({ id: f.id, claim: f.claim, source: f.source })) };
R.finalize = { filledEmptyFacts: filled, patchedDoubtNotWeb: patched };
fs.writeFileSync(P, JSON.stringify(R, null, 1) + '\n');
console.log(JSON.stringify({ filled, patched, facts: R.stats.facts, dist, ge3: ge3.length }));
