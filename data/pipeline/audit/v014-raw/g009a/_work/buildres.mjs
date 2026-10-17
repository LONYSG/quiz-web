// g009a 판정 합본 → audit/v014-results.json (V009 꼴)
import fs from 'node:fs';
const R = 'C:/work/quiz-web/data/pipeline/audit/v014-raw/g009a'; const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = Object.fromEntries(J(R + '/_work/items.json').map((x) => [x.ref, x]));
const sum = J(R + '/_work/summary.json');
const all = []; for (let i = 1; i <= 8; i++) for (const x of J(`${R}/g${i}.out.json`)) all.push({ ...x, piece: 'g' + i });
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
// VERIFY 재독으로 뒤집은 것
const flipped = [];
const S310 = all.find((x) => x.ref === 'S3-10');
if (S310 && S310.verdict === 'ok') { flipped.push({ ref: 'S3-10', from: 'ok', to: 'fix', categories: ['famous-one'], why: "힌트 '1924년 파리 대회 이 종목 여자 단식 금메달' 은 질문(1924 파리 올림픽 · 이 종목)을 되풀이하고 '여자 단식' 이 종목(테니스)을 곧바로 가리킨다(H3/H9). 새 힌트는 문서로 못 닫아 제안 없음 — G011 이 정답 비노출 두 번째 줄 사실로 교체" }); S310.verdict = 'fix'; S310.categories = ['famous-one']; S310.verifyFlip = true; }
const by = Object.fromEntries(all.map((x) => [x.ref, x]));
// r2
const r2 = J(R + '/r2.out.json'); const calibRefs = J(R + '/_work/r2.calib.json');
const calVerify = { '#3848': 3, '#633': 3, '#2571': 3, '#2035': 3, '#3691': 3, '#1429': 4, '#1771': 3, '#548': 2, '#4213': 4, '#2265': 4, '#4034': 4, '#4092': 3 };
const calRows = r2.filter((x) => calibRefs.includes(x.ref)).map((x) => ({ ref: x.ref, judge: x.dif, verify: calVerify[x.ref] }));
const cal = { n: calRows.length, exact: calRows.filter((x) => x.judge === x.verify).length, within1: calRows.filter((x) => Math.abs(x.judge - x.verify) <= 1).length, lower: calRows.filter((x) => x.judge < x.verify).length, higher: calRows.filter((x) => x.judge > x.verify).length, rows: calRows };
const pairs = r2.filter((x) => by[x.ref]).map((x) => ({ ref: x.ref, r2: x.dif, judge: by[x.ref].score.dif, gen: items[x.ref].score.dif }));
const r2Stats = { n: pairs.length, exact: pairs.filter((p) => p.r2 === p.judge).length, within1: pairs.filter((p) => Math.abs(p.r2 - p.judge) <= 1).length, judgeTop: pairs.filter((p) => p.judge >= 4).length, r2Top: pairs.filter((p) => p.r2 >= 4).length, bothTop: pairs.filter((p) => p.judge >= 4 && p.r2 >= 4).length, genTop: pairs.filter((p) => p.gen >= 4).length, r2Dist: cnt(pairs, (p) => p.r2) };
// 매트릭스 GEN 최종 → 판정자
const matrix = {}; for (const x of all) { const k = items[x.ref].score.dif + '>' + x.score.dif; matrix[k] = (matrix[k] || 0) + 1; }
const topAfter = all.filter((x) => x.score.dif >= 4 && x.verdict !== 'drop');
const byTopic = {}; for (const t of Object.keys(sum.topic)) { const a = all.filter((x) => items[x.ref].topic === t); byTopic[t] = { n: a.length, ok: a.filter((x) => x.verdict === 'ok').length, fix: a.filter((x) => x.verdict === 'fix').length, drop: a.filter((x) => x.verdict === 'drop').length, genTop: a.filter((x) => items[x.ref].score.dif >= 4).length, judgeTop: a.filter((x) => x.score.dif >= 4).length }; }
const HINTCATS = ['spoon-feed', 'famous-one', 'meaning', 'shape-only', 'shape', 'wrong-name', 'pair-same', 'letters', 'alias', 'h-error', 'explain-overlap', 'question-repeat', 'weak'];
const nonOk = all.filter((x) => x.verdict !== 'ok'); const cat = {}; for (const x of nonOk) for (const k of x.categories || []) cat[k] = (cat[k] || 0) + 1;
const hintFix = all.filter((x) => x.verdict !== 'ok' && (x.categories || []).some((c) => HINTCATS.includes(c)));
const second = all.filter((x) => items[x.ref].method === '가');
const rwBad = all.filter((x) => x.rewriteCheck?.applies && (x.rewriteCheck.unique === false || x.rewriteCheck.addedCueInFacts === false || x.rewriteCheck.minor || x.rewriteCheck.readable === false)).map((x) => x.ref);
const counts = { targets: 464, ok: all.filter((x) => x.verdict === 'ok').length, fix: all.filter((x) => x.verdict === 'fix').length, drop: all.filter((x) => x.verdict === 'drop').length, unsure: all.filter((x) => x.verdict === 'unsure').length, genTop: sum.genTop, judgeTop: all.filter((x) => x.score.dif >= 4).length, judgeTopNotDrop: topAfter.length, blindDist: cnt(all, (x) => x.score.dif), genDist: cnt(all, (x) => items[x.ref].score.dif) };
const out = {
  round: 'V014', part: 'g009a 상 생성 3차 첫 묶음 464 전수 판정 (g009b 는 아직 없음)', date: '2026-10-18', model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)',
  web: { judges: 8, webFetchApprox: 75 + 105 + 74 + 75 + 70 + 95 + 85 + 57, webSearchApprox: 3 + 2 + 2 + 1 + 0 + 3 + 2 + 3, r429: 0, note: '판정자 자기 보고 근사 · 8조각 + 독립 채점자 1(웹 없음)' },
  counts: { ...sum, ...counts },
  stats: { verdict: counts, byTopic, categories: cat, hint: { hasHint: sum.hint, hintFix: hintFix.length, famousOne: cat['famous-one'] || 0, letters: cat.letters || 0, meaning: cat.meaning || 0, pairSame: cat['pair-same'] || 0, hError: cat['h-error'] || 0 }, variants: { fix: cat.variants || 0, items: sum.variantsItems }, rewrite: { changed: 270, fixed: all.filter((x) => items[x.ref].rewrite?.changed === true && x.verdict === 'fix').length, rewriteCheckBad: rwBad }, second: { n: second.length, ok: second.filter((x) => x.verdict === 'ok').length, fix: second.filter((x) => x.verdict === 'fix').length, drop: second.filter((x) => x.verdict === 'drop').length }, defForm: { gen: sum.defForm, judge: all.filter((x) => x.defForm).length } },
  rescoreVsGen: { version: 'score-v3 blind (판정자 · GEN 점수 미공개)', matrix, genTop: sum.genTop, newTop: counts.judgeTop, down: all.filter((x) => x.score.dif < items[x.ref].score.dif).length, up: all.filter((x) => x.score.dif > items[x.ref].score.dif).length, same: all.filter((x) => x.score.dif === items[x.ref].score.dif).length, r2: r2Stats, calib: cal, byTopic },
  flipped, items: Object.fromEntries(all.map((x) => [x.ref, x])),
};
fs.writeFileSync(A + '/v014-results.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ counts: out.counts && { ok: counts.ok, fix: counts.fix, drop: counts.drop, judgeTop: counts.judgeTop }, r2Stats, cal: { n: cal.n, exact: cal.exact, within1: cal.within1, lower: cal.lower }, hintFix: hintFix.length, second: out.stats.second, flipped: flipped.length, rwBad }));
