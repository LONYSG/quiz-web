// V009 build — 판정자 출력 + VERIFY 교체(ov.json) + 사실 확인 → data/pipeline/audit/v009-results.json
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v9';
const R = 'C:/work/quiz-web/data/pipeline/audit/v009-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const items = Object.fromEntries(J(SC + '/items.json').map((x) => [x.ref, x]));
const ov = J(R + '/_work/ov.json'); const summary = J(R + '/_work/summary.json');
const judged = []; for (let i = 1; i <= 8; i++) for (const x of J(`${R}/p${i}.out.json`)) judged.push({ ...x, piece: 'p' + i });
const L = (k) => J(`${R}/${k}.out.json`);
const slimFacts = (x) => (x.facts || []).map((f) => ({ claim: f.claim, where: f.where, result: f.result, basis: f.basis, source: f.source || null, proposal: !!f.proposal }));
const flipped = [];
const out = {};
for (const x of judged) {
  const t = items[x.ref]; const o = ov[x.ref];
  let verdict = x.verdict, categories = [...(x.categories || [])], reason = x.reason;
  const p = { ...(x.proposal || {}) }; const byVerify = {};
  if (o) {
    if (o.verdict && o.verdict !== x.verdict) { flipped.push({ ref: x.ref, from: x.verdict, to: o.verdict, why: o.reason }); verdict = o.verdict; categories = o.categories || categories; reason = o.reason; }
    for (const k of ['hint', 'question', 'explanation', 'variants']) if (Object.hasOwn(o, k)) { byVerify[k] = { judge: p[k] ?? null, verify: o[k], why: o.why || null, source: o.source || null }; p[k] = o[k]; }
  }
  out[x.ref] = {
    ref: x.ref, topic: t.topic, mid: t.mid, sub: t.sub, method: t.method, answer: t.answer, rewriteChanged: !!t.rewrite?.changed, hasHint: !!t.hint,
    verdict, categories, reason, judgeVerdict: x.verdict,
    dif: x.score.dif, easiestCue: x.score.easiestCue, difWhy: x.score.difWhy, genDif: t.score.dif, wor: x.score.wor ?? null, acc: x.score.acc ?? null,
    rewriteCheck: x.rewriteCheck || { applies: false }, variantsCheck: x.variantsCheck || null, hintRead: x.hintRead || null, depth: x.depth || null, dup: x.dup || null,
    proposal: { question: p.question ?? null, explanation: p.explanation ?? null, hint: p.hint ?? null, variants: p.variants ?? null, layer: p.layer ?? null, score: p.score ?? null, byVerify: Object.keys(byVerify).length ? byVerify : null },
    webOpened: !!x.webOpened, facts: slimFacts(x), note: x.note || null, piece: x.piece,
  };
}
// ── 재채점 비교
const refs = Object.keys(out);
const mat = {}; for (const r of refs) { const k = `${out[r].genDif}→${out[r].dif}`; mat[k] = (mat[k] || 0) + 1; }
const topics = ['korea', 'sports', 'life', 'media', 'arts', 'science', 'history'];
const byTopic = Object.fromEntries(topics.map((tp) => { const a = refs.filter((r) => out[r].topic === tp); const gen = a.filter((r) => out[r].genDif >= 4).length, nw = a.filter((r) => out[r].dif >= 4).length, nonDrop = a.filter((r) => out[r].verdict !== 'drop'); return [tp, { n: a.length, genTop: gen, genPct: +(gen / a.length * 100).toFixed(1), newTop: nw, newPct: +(nw / a.length * 100).toFixed(1), newTopNonDrop: nonDrop.filter((r) => out[r].dif >= 4).length, drop: a.length - nonDrop.length }]; }));
const rw = refs.filter((r) => out[r].rewriteChanged), nr = refs.filter((r) => !out[r].rewriteChanged);
const rwStat = { n: rw.length, genTop: rw.filter((r) => out[r].genDif >= 4).length, newTop: rw.filter((r) => out[r].dif >= 4).length, keptTop: rw.filter((r) => out[r].genDif >= 4 && out[r].dif >= 4).length };
const nrStat = { n: nr.length, genTop: nr.filter((r) => out[r].genDif >= 4).length, newTop: nr.filter((r) => out[r].dif >= 4).length, keptTop: nr.filter((r) => out[r].genDif >= 4 && out[r].dif >= 4).length };
const first = refs.filter((r) => items[r].rewrite === null || items[r].rewrite?.changed == null).filter((r) => !out[r].rewriteChanged && items[r].rewrite == null);
const unchanged65 = refs.filter((r) => items[r].rewrite && items[r].rewrite.changed === false);
const none201 = refs.filter((r) => !items[r].rewrite);
const grp = (a) => ({ n: a.length, genTop: a.filter((r) => out[r].genDif >= 4).length, newTop: a.filter((r) => out[r].dif >= 4).length, kept: a.filter((r) => out[r].genDif >= 4 && out[r].dif >= 4).length });
const rescoreVsGen = {
  version: 'blind (score·score1·easiestCue·targetWhy·selfJudge·removedCue 를 뺀 입력)', matrix: mat, genTop: refs.filter((r) => out[r].genDif >= 4).length, newTop: refs.filter((r) => out[r].dif >= 4).length,
  down: refs.filter((r) => out[r].dif < out[r].genDif).length, up: refs.filter((r) => out[r].dif > out[r].genDif).length, same: refs.filter((r) => out[r].dif === out[r].genDif).length,
  genTopToNot: refs.filter((r) => out[r].genDif >= 4 && out[r].dif < 4).length, notToTop: refs.filter((r) => out[r].genDif < 4 && out[r].dif >= 4).length,
  byTopic, rewriteChanged227: grp(rw), rewriteNotChanged65: grp(unchanged65), neverRewritten201: grp(none201),
  byPiece: Object.fromEntries(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((k) => { const a = refs.filter((r) => out[r].piece === k); return [k, { n: a.length, newTop: a.filter((r) => out[r].dif >= 4).length, genTop: a.filter((r) => out[r].genDif >= 4).length }]; })),
  korea: { activeTopBefore: 45, genTop: byTopic.korea.genTop, newTop: byTopic.korea.newTop, newTopNonDrop: byTopic.korea.newTopNonDrop },
  rater2: null,
};
if (fs.existsSync(R + '/r2.out.json')) {
  const r2 = L('r2'); const rows = r2.map((x) => ({ ref: x.ref, a: out[x.ref].dif, b: x.dif, gen: out[x.ref].genDif, piece: out[x.ref].piece, cue2: x.easiestCue, why2: x.difWhy }));
  const d = (a, b) => Math.abs(a - b); const topAgree = rows.filter((r) => (r.a >= 4) === (r.b >= 4)).length;
  rescoreVsGen.rater2 = { n: rows.length, exact: rows.filter((r) => r.a === r.b).length, within1: rows.filter((r) => d(r.a, r.b) <= 1).length, topAgree, judgeTop: rows.filter((r) => r.a >= 4).length, rater2Top: rows.filter((r) => r.b >= 4).length, genTop: rows.filter((r) => r.gen >= 4).length, meanJudge: +(rows.reduce((s, r) => s + r.a, 0) / rows.length).toFixed(2), meanRater2: +(rows.reduce((s, r) => s + r.b, 0) / rows.length).toFixed(2), meanGen: +(rows.reduce((s, r) => s + r.gen, 0) / rows.length).toFixed(2),
    byPiece: Object.fromEntries(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((k) => { const a = rows.filter((r) => r.piece === k); return [k, { n: a.length, judgeTop: a.filter((r) => r.a >= 4).length, rater2Top: a.filter((r) => r.b >= 4).length }]; })),
    disagreeTop: rows.filter((r) => (r.a >= 4) !== (r.b >= 4)).map((r) => ({ ref: r.ref, judge: r.a, rater2: r.b, gen: r.gen })) };
}
// ── 사실
const factSets = {}; for (const k of ['x1', 'x2', 'x3', 'x4']) if (fs.existsSync(`${R}/${k}.out.json`)) factSets[k] = L(k);
const xsets = J(R + '/_work/xsets.json'); const kindOf = (ref) => (xsets.U.includes(ref) ? 'U' : xsets.B.includes(ref) ? 'B' : 'R');
const factChecks = {}; for (const [k, a] of Object.entries(factSets)) for (const x of a) factChecks[x.ref] = { set: kindOf(x.ref), verdict: x.verdict, claims: x.claims, from: k };
const fc = Object.values(factChecks); const allClaims = fc.flatMap((x) => x.claims.map((c) => ({ ...c, set: x.set })));
const propChecks = {}; for (const k of ['y1', 'y2']) if (fs.existsSync(`${R}/${k}.out.json`)) for (const x of L(k)) propChecks[x.ref] = { verdict: x.verdict, claims: x.claims, from: k };
const pcClaims = Object.values(propChecks).flatMap((x) => x.claims);
const factStats = {
  all: { items: fc.length, claims: allClaims.length, ...cnt(allClaims, (c) => c.result), basis: cnt(allClaims, (c) => c.basis || 'none') },
  bySet: Object.fromEntries(['U', 'B', 'R'].map((s) => { const a = allClaims.filter((c) => c.set === s); return [s, { items: fc.filter((x) => x.set === s).length, claims: a.length, ...cnt(a, (c) => c.result) }]; })),
  proposals: { items: Object.keys(propChecks).length, claims: pcClaims.length, ...cnt(pcClaims, (c) => c.result) },
  judgeFacts: { ...cnt(judged.flatMap((x) => (x.facts || []).filter((f) => !f.proposal).map((f) => f.result)), (r) => r), false: judged.flatMap((x) => (x.facts || []).filter((f) => f.result === 'false').map((f) => x.ref + ':' + f.where)) },
  webOpened: { true: judged.filter((x) => x.webOpened).length, false: judged.filter((x) => !x.webOpened).length },
};
// ── 통계
const all = Object.values(out); const verdictBy = (a) => cnt(a, (x) => x.verdict);
const stats = {
  verdict: verdictBy(all), judgeVerdict: cnt(all, (x) => x.judgeVerdict), byTopic: Object.fromEntries(topics.map((tp) => [tp, verdictBy(all.filter((x) => x.topic === tp))])), byPiece: Object.fromEntries(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((k) => [k, verdictBy(all.filter((x) => x.piece === k))])),
  categories: cnt(all.filter((x) => x.verdict !== 'ok').flatMap((x) => x.categories), (c) => c), dropCategories: cnt(all.filter((x) => x.verdict === 'drop').flatMap((x) => x.categories), (c) => c),
  rewrite: { changed227: cnt(all.filter((x) => x.rewriteChanged), (x) => x.verdict), checkApplies: all.filter((x) => x.rewriteCheck?.applies).length, issues: all.filter((x) => x.rewriteCheck?.applies && (x.rewriteCheck.unique === false || x.rewriteCheck.addedCueInFacts === false || x.rewriteCheck.minor === true || x.rewriteCheck.readable === false)).map((x) => x.ref), rewriteCategories: all.filter((x) => x.categories.some((c) => /^rewrite-/.test(c))).map((x) => x.ref + ':' + x.categories.filter((c) => /^rewrite-/.test(c)).join(',')) },
  hint: { withHint: all.filter((x) => x.hasHint).length, fixHint: all.filter((x) => x.verdict === 'fix' && x.hasHint && x.categories.some((c) => ['famous-one', 'meaning', 'question-repeat', 'h-error', 'weak', 'letters', 'spoon-feed', 'pair-same', 'explain-overlap', 'wrong-name', 'alias', 'shape-only', 'shape'].includes(c))).length, missingHint: all.filter((x) => x.categories.some((c) => ['no-hint', 'hint-missing'].includes(c))).map((x) => x.ref), newRules: { shapeOnly: all.filter((x) => x.categories.includes('shape-only')).map((x) => x.ref), wrongName: all.filter((x) => x.categories.some((c) => ['wrong-name', 'alias'].includes(c))).map((x) => x.ref), pairSame: all.filter((x) => x.categories.includes('pair-same')).map((x) => x.ref) } },
  variants: { itemsWithVariants: all.filter((x) => items[x.ref].variants?.length).length, fix: all.filter((x) => x.proposal.variants).map((x) => x.ref) },
  proposals: { hint: all.filter((x) => x.verdict !== 'drop' && x.proposal.hint).length, question: all.filter((x) => x.proposal.question).length, explanation: all.filter((x) => x.proposal.explanation).length, variants: all.filter((x) => x.proposal.variants).length, byVerifyReplaced: all.filter((x) => x.proposal.byVerify).map((x) => x.ref), fixNoProposal: all.filter((x) => x.verdict === 'fix' && !x.proposal.hint && !x.proposal.question && !x.proposal.explanation && !x.proposal.variants).map((x) => x.ref) },
  media: { wor2: all.filter((x) => items[x.ref].score.wor === 2).length, wor2Verdict: cnt(all.filter((x) => items[x.ref].score.wor === 2), (x) => x.verdict), wor2Drop: all.filter((x) => items[x.ref].score.wor === 2 && x.verdict === 'drop').map((x) => x.ref) },
  second: { n: all.filter((x) => x.method === '가').length, verdict: cnt(all.filter((x) => x.method === '가'), (x) => x.verdict) },
  amb: all.filter((x) => x.verdict === 'ok' && /^애매/.test(x.note || '')).length,
};
const result = {
  round: 'V009', date: '2026-10-15', model: 'claude-sonnet-5-5 (VERIFY · 판정자·확인자 하위 에이전트도 같은 모델)', web: J(R + '/_work/web.json'),
  counts: { targets: summary.targets, topic: summary.topic, genTop: summary.genTop, rewrite: summary.rewrite, hint: summary.hint, hintBasis: summary.hintBasis, paired: summary.paired, variantsItems: summary.variantsItems, variantsN: summary.variantsN, wor2: summary.wor.hasOwnProperty('2') ? summary.wor['2'] : null, activeDb: summary.activeDb, g005InDb: summary.g005InDb, sameActive: summary.warn.sameActive },
  stats, items: out, rescoreVsGen, flipped, factChecks, factStats, propChecks, xsets, ysets: J(R + '/_work/ysets.json'), ok10: J(R + '/_work/ok-sample.json'),
};
fs.writeFileSync(A + '/v009-results.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify({ stats: { verdict: stats.verdict, byTopic: stats.byTopic, proposals: stats.proposals, media: stats.media, second: stats.second }, rescoreVsGen: { ...rescoreVsGen, matrix: undefined }, factStats, flipped: flipped.length }, null, 1));
