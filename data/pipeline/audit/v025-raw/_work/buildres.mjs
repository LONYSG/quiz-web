// g019a 판정 합본 → audit/v025-results.json (V016 꼴 + familiarity2 · blind · layer · secondRound · rewriteEffect)
import fs from 'node:fs';
const R = 'C:/work/quiz-web/data/pipeline/audit/v025-raw'; const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = Object.fromEntries(J(R + '/_work/items.json').map((x) => [x.ref, x]));
const all = []; for (let i = 1; i <= 12; i++) for (const x of J(`${R}/g${i}.out.json`)) all.push({ ...x, piece: 'g' + i });
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const by = Object.fromEntries(all.map((x) => [x.ref, x]));
// VERIFY 재독으로 뒤집은 것 — 맞혀 보기(정답 모르는 판정자)가 A/C 경로 · 확신 high 로 맞혔고 판정자 note 가 "곧바로/정답/정의/가장 유명" 으로 스스로 인정한 ok 4건
const flipped = [];
for (const [ref, why] of [
  ['C1-11', "힌트 '1948년 전까지 열화학에서 쓰던 이 단위는 4.1833 국제 줄' — 열량 단위의 정의 서술(CV-05 정의)이라 힌트만으로 칼로리. 맞혀 보기 A·high 로 맞힘 · 판정자 note 도 '정의 서술에 가까워 바로 닿을 수 있음'"],
  ['M2-02', "힌트 '영국 밴드 에이드 자선 싱글에 자극받은 벨러폰테가 미국판을 만들자고 나섬' — 곡의 가장 유명한 탄생 일화(CV-05 ② 대표 일화). 맞혀 보기 A·high 로 맞힘 · 판정자 note '곡을 아는 사람에게는 바로 정답'"],
  ['H1-28', "힌트 '1898년 8월 12일 이올라니 궁전 계단에서 주권을 미국에 넘기는 의식' — 하와이 병합의 대표 사건(CV-11 대표 사건). 맞혀 보기 A·high 로 맞힘 · 판정자 note '가장 유명한 사건에 가까움'"],
  ['S1-12', "힌트 '퀘스텍 탓에 실제로 판정되는 이것이 규칙에 더 가깝게 넓어졌다' — 야구에서 '판정되는 이것'이 곧 스트라이크 존(정체). 맞혀 보기 A·high 로 맞힘 · 판정자 note '야구 팬에겐 곧바로 읽힘'"],
]) { const x = by[ref]; if (x && x.verdict === 'ok') { flipped.push({ ref, from: 'ok', to: 'fix', categories: ['famous-one'], why }); x.verdict = 'fix'; x.categories = ['famous-one']; x.verifyFlip = true; x.reason = `${x.reason} ⇒ VERIFY 뒤집음: ${why}`; } }
const sum = J(R + '/_work/summary.json');
// s2
const s2 = J(R + '/s2.out.json'); const calibRefs = J(R + '/_work/s2.calib.json');
const calVerify = { '#3848': 3, '#633': 3, '#2571': 3, '#2035': 3, '#3691': 3, '#1429': 4, '#1771': 3, '#548': 2, '#4213': 4, '#2265': 4, '#4034': 4, '#4092': 3 };
const calRows = s2.filter((x) => calibRefs.includes(x.ref)).map((x) => ({ ref: x.ref, judge: x.dif, verify: calVerify[x.ref] }));
const cal = { n: calRows.length, exact: calRows.filter((x) => x.judge === x.verify).length, within1: calRows.filter((x) => Math.abs(x.judge - x.verify) <= 1).length, lower: calRows.filter((x) => x.judge < x.verify).length, higher: calRows.filter((x) => x.judge > x.verify).length, rows: calRows };
const pairs = s2.filter((x) => by[x.ref]).map((x) => ({ ref: x.ref, s2: x.dif, judge: by[x.ref].score.dif, gen: items[x.ref].score.dif }));
const r2Stats = { n: pairs.length, exact: pairs.filter((p) => p.s2 === p.judge).length, within1: pairs.filter((p) => Math.abs(p.s2 - p.judge) <= 1).length, judgeTop: pairs.filter((p) => p.judge >= 4).length, s2Top: pairs.filter((p) => p.s2 >= 4).length, bothTop: pairs.filter((p) => p.judge >= 4 && p.s2 >= 4).length, genTop: pairs.filter((p) => p.gen >= 4).length, s2Dist: cnt(pairs, (p) => p.s2), s2VsGenExact: pairs.filter((p) => p.s2 === p.gen).length };
const matrix = {}; for (const x of all) { const k = items[x.ref].score.dif + '>' + x.score.dif; matrix[k] = (matrix[k] || 0) + 1; }
const byTopic = {}; for (const t of Object.keys(sum.topic)) { const a = all.filter((x) => items[x.ref].topic === t); byTopic[t] = { n: a.length, ok: a.filter((x) => x.verdict === 'ok').length, fix: a.filter((x) => x.verdict === 'fix').length, drop: a.filter((x) => x.verdict === 'drop').length, genTop: a.filter((x) => items[x.ref].score.dif >= 4).length, judgeTop: a.filter((x) => x.score.dif >= 4).length }; }
const HINTCATS = ['spoon-feed', 'famous-one', 'meaning', 'shape-only', 'shape', 'wrong-name', 'pair-same', 'letters', 'alias', 'h-error', 'explain-overlap', 'question-repeat', 'weak', 'name-group'];
const nonOk = all.filter((x) => x.verdict !== 'ok'); const cat = {}; for (const x of nonOk) for (const k of x.categories || []) cat[k] = (cat[k] || 0) + 1;
const hintFix = all.filter((x) => x.verdict !== 'ok' && (x.categories || []).some((c) => HINTCATS.includes(c)));
const second = all.filter((x) => items[x.ref].method === '가');
// 친숙도 둘째 판정자
const fam2 = J(R + '/_work/fam2.json');
const famRows = Object.keys(items).map((ref) => ({ ref, answer: items[ref].answer, topic: items[ref].topic, gen: items[ref].familiarity.judge, genPct: items[ref].familiarity.pct, second: fam2[ref].familiarity, secondPct: fam2[ref].pct, why: fam2[ref].why, piece: fam2[ref].piece }));
const famCalib = { runs: { f01: '2/5(재실행)', f02: '4/5', f03: '5/5', f04: '5/5', f05: '2/5(재실행)', f06: '5/5', r1: '5/5(f01·f05 항목)', r2: '5/5(f01·f05 항목)' }, caught1Final: '29/30(f02 4 · f03 5 · f04 5 · f06 5 · r1 5 · r2 5)' };
// blind 맞혀 보기
const grows = J(R + '/_work/guess-rows2.json');
const gcnt = { n: grows.length, hit: grows.filter((r) => r.hit).length, genHit: grows.filter((r) => r.genHit).length, hitByHow: cnt(grows.filter((r) => r.hit), (r) => r.how), missByHow: cnt(grows.filter((r) => !r.hit), (r) => r.how), agree: cnt(grows, (r) => (r.hit ? 'V1' : 'V0') + '/' + (r.genHit ? 'G1' : 'G0')), byTopic: Object.fromEntries(Object.entries(cnt(grows, (r) => r.topic)).map(([t, n]) => [t, { n, hit: grows.filter((r) => r.topic === t && r.hit).length }])) };
// 층 · 2회차 · 고침 효과
const lc = all.filter((x) => x.layerCheck && x.layerCheck.given !== undefined);
const layer = { n: lc.length, table: cnt(lc, (x) => items[x.ref].topic + ':' + x.layerCheck.given + '>' + x.layerCheck.should), mediaMismatch: lc.filter((x) => items[x.ref].topic === 'media' && x.layerCheck.given !== x.layerCheck.should).map((x) => ({ ref: x.ref, answer: items[x.ref].answer, given: x.layerCheck.given, should: x.layerCheck.should, why: x.layerCheck.why })), sportsShouldHaveLayer: lc.filter((x) => items[x.ref].topic === 'sports' && x.layerCheck.should !== '없음').map((x) => ({ ref: x.ref, should: x.layerCheck.should })) };
const sr = all.filter((x) => x.secondRound);
const secondRound = { n: second.length, ok: second.filter((x) => x.verdict === 'ok').length, fix: second.filter((x) => x.verdict === 'fix').length, drop: second.filter((x) => x.verdict === 'drop').length, reuseDef: sr.filter((x) => x.secondRound.reuseDef).map((x) => x.ref), overlapFirstHint: sr.filter((x) => x.secondRound.overlapFirstHint).map((x) => x.ref), easierThanFirst: sr.filter((x) => x.secondRound.easierThanFirst).map((x) => x.ref) };
const rw = all.filter((x) => x.rewriteEffect);
const rewriteEffect = { n: rw.length, factBad: rw.filter((x) => x.rewriteEffect.factStillTrue === false).map((x) => x.ref), firstSentenceCue: rw.filter((x) => x.rewriteEffect.firstSentenceCue).map((x) => x.ref), fixed: all.filter((x) => items[x.ref].rewrite?.changed === true && x.verdict === 'fix').length, rewriteCheckBad: all.filter((x) => x.rewriteCheck?.applies && (x.rewriteCheck.unique === false || x.rewriteCheck.addedCueInFacts === false || x.rewriteCheck.minor || x.rewriteCheck.readable === false)).map((x) => x.ref) };
const counts = { targets: 346, ok: all.filter((x) => x.verdict === 'ok').length, fix: all.filter((x) => x.verdict === 'fix').length, drop: all.filter((x) => x.verdict === 'drop').length, unsure: all.filter((x) => x.verdict === 'unsure').length, genTop: sum.genTop, judgeTop: all.filter((x) => x.score.dif >= 4).length, judgeTopNotDrop: all.filter((x) => x.score.dif >= 4 && x.verdict !== 'drop').length, blindDist: cnt(all, (x) => x.score.dif), genDist: cnt(all, (x) => items[x.ref].score.dif) };
const out = {
  round: 'V025', part: 'g019a 상 생성 4차 첫 묶음 346 전수 판정', date: '2026-10-25', model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)',
  web: { judges: 12, webFetchApprox: 65 + 50 + 60 + 60 + 70 + 50 + 60 + 59 + 54 + 58 + 47 + 50, webSearchApprox: 2 + 0 + 0 + 2 + 1 + 1 + 3 + 0 + 2 + 2 + 1 + 1, r429: 0, note: '판정자 자기 보고 근사 · 판정자 12조각 + 친숙도 8 + 맞혀 보기 5 + 독립 채점자 1(웹 없음) · 스트림 멈춤 1(g2 — 이어서)' },
  counts: { ...sum, ...counts },
  stats: { verdict: counts, byTopic, categories: cat, hint: { hasHint: sum.hint, hintFix: hintFix.length, famousOne: cat['famous-one'] || 0, hError: cat['h-error'] || 0, letters: cat.letters || 0, meaning: cat.meaning || 0, pairSame: cat['pair-same'] || 0, nameGroup: cat['name-group'] || 0 }, variants: { fix: cat.variants || 0, items: sum.variantsItems }, rewrite: rewriteEffect, second: secondRound, defForm: { gen: sum.defForm, judge: all.filter((x) => x.defForm).length } },
  rescoreVsGen: { version: 'score-v3 blind (판정자 · GEN 점수 미공개)', matrix, genTop: sum.genTop, newTop: counts.judgeTop, down: all.filter((x) => x.score.dif < items[x.ref].score.dif).length, up: all.filter((x) => x.score.dif > items[x.ref].score.dif).length, same: all.filter((x) => x.score.dif === items[x.ref].score.dif).length, s2: r2Stats, calib: cal, byTopic },
  familiarity2: { rows: famRows, counts: cnt(famRows, (r) => r.second), genVsSecond: cnt(famRows, (r) => r.gen + '>' + r.second), calib: famCalib },
  blind: { stats: gcnt, rows: grows.map((r) => ({ ref: r.ref, answer: r.answer, guess: r.guess, conf: r.conf, how: r.how, hit: r.hit, genHit: r.genHit, hintFix: r.hintFix })) },
  layer, secondRound, rewriteEffect, flipped, items: Object.fromEntries(all.map((x) => [x.ref, x])),
};
fs.writeFileSync(A + '/v025-results.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ counts, flipped: flipped.length, famCounts: out.familiarity2.counts, gcnt: { hit: gcnt.hit, genHit: gcnt.genHit }, layer: layer.table, secondRound, r2Stats, cal: { exact: cal.exact, within1: cal.within1, lower: cal.lower }, hintFix: hintFix.length }));
