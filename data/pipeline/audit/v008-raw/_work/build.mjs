// V008 build — 판정자 출력 + VERIFY 교체(ov.json) + 사실 확인 → data/pipeline/audit/v008-results.json
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const R = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const q = J(SC + '/qrows.json'); const gaIn = Object.fromEntries(J(SC + '/ga.json').map((x) => [String(x.id), x]));
const naIn = Object.fromEntries(J(SC + '/na.json').map((x) => [x.key, x])); const daIn = J(SC + '/da-all.json');
const ov = J(R + '/_work/ov.json'); const summary = J(R + '/_work/summary.json');
const L = (k) => J(`${R}/${k}.out.json`);
const exists = (k) => fs.existsSync(`${R}/${k}.out.json`);

// ── 판정자 출력 모으기
const ga = [...L('g1'), ...L('g2'), ...L('g3')], na = L('n1'), da = [...L('d1'), ...L('d2'), ...L('d3')];
const dBy = Object.fromEntries(da.map((x) => [x.key, x]));
const piece = {}; for (const [k, set] of [['g1', 'g'], ['g2', 'g'], ['g3', 'g'], ['n1', 'n'], ['d1', 'd'], ['d2', 'd'], ['d3', 'd']]) for (const x of L(k)) piece[set + x.key] = k;

const prop = (x, key) => { const o = ov[key]; if (o !== undefined) return { hint: o.hint, by: 'verify', why: o.why, source: o.source, judgeHint: x?.proposal?.hint ?? null }; return { hint: x?.proposal?.hint ?? null, by: x?.proposal?.hint ? 'judge' : null, why: null, source: null, judgeHint: x?.proposal?.hint ?? null }; };
const slimFacts = (x) => (x.facts || []).map((f) => ({ claim: f.claim, result: f.result, basis: f.basis, source: f.source || null, proposal: !!f.proposal }));

// (가)
const g002Rest = {};
for (const x of ga) {
  const g = gaIn[x.key]; const d = dBy[x.key];
  let verdict = x.verdict, categories = [...(x.categories || [])], reason = x.reason, via = ['g'];
  if (d && d.verdict === 'fix' && x.verdict === 'ok') { verdict = 'fix'; categories = [...new Set([...categories, ...(d.categories || [])])]; reason = `(다) ${d.reason}`; via.push('d'); }
  if (d && d.verdict === 'ok' && x.verdict === 'fix') via.push('d-ok-superseded');
  const base = verdict === 'fix' ? (x.verdict === 'fix' ? x : d) : x;
  const p = verdict === 'fix' ? prop(base, x.key) : { hint: null, by: null, why: null, source: null, judgeHint: null };
  g002Rest[x.key] = {
    id: Number(x.key), answer: g.answer, current: g.after, v006: g.v002 || g.v006?.verdict, by: g.by,
    verdict, categories, reason, afterVsBefore: x.afterVsBefore, alone: x.alone, doubt: !!x.doubt, webOpened: !!x.webOpened,
    sameFact: x.sameFact || null, hintHint: x.hintHint || d?.hintHint || null,
    proposal: { hint: p.hint, by: p.by, verifyNote: p.why, verifySource: p.source, judgeHint: p.judgeHint },
    facts: slimFacts(x), note: x.note || null, via, piece: piece['g' + x.key],
  };
}
// (나)
const g004Gen = {};
for (const x of na) {
  const n = naIn[x.key];
  const p = x.verdict === 'fix' ? prop(x, x.key) : { hint: null, by: null, why: null, source: null, judgeHint: null };
  g004Gen[x.key] = {
    id: n.id, ref: x.key.startsWith('g003-') ? x.key.slice(5) : null, field: n.field === 'general_hint' ? 'hint' : n.field, source: n.src,
    answer: n.answer, current: n.after, before: n.before, gSays: n.why,
    verdict: x.verdict, categories: x.categories || [], reason: x.reason, afterVsBefore: x.afterVsBefore, alone: x.alone, doubt: !!x.doubt, webOpened: !!x.webOpened,
    proposal: { hint: p.hint, by: p.by, verifyNote: p.why, verifySource: p.source, judgeHint: p.judgeHint, question: x.proposal?.question ?? null, explanation: x.proposal?.explanation ?? null },
    facts: slimFacts(x), note: x.note || null,
  };
}
g004Gen['g003-A2-01'] = { id: null, ref: 'A2-01', field: 'discarded', verdict: 'na', reason: 'G004 가 버린 문항(제안대로 고쳐도 1회차 #513 해설과 같은 지식) — 문구 아님, 판정 대상 밖' };

// (다) — 힌트 단위 판정 + 쌍 키
const h12 = {}; const h12ByHint = {}; const c66 = { judged: [], hintHint: [] };
const citedIds = (sf) => [...String(sf || '').matchAll(/#(\d+)/g)].map((m) => m[1]);
for (const e of daIn) {
  const x = dBy[String(e.id)]; const id = String(e.id); const r = q[id];
  const p = x.verdict === 'fix' ? prop(x, id) : { hint: null, by: null, why: null, source: null, judgeHint: null };
  const cited = new Set(citedIds(x.sameFact));
  h12ByHint[id] = { id: e.id, answer: r.answer, current: r.hint, verdict: x.verdict, categories: x.categories || [], reason: x.reason, sameFact: x.sameFact, hintHint: x.hintHint || null, c66: !!x.c66, doubt: !!x.doubt, webOpened: !!x.webOpened,
    proposal: { hint: p.hint, by: p.by, verifyNote: p.why, verifySource: p.source, judgeHint: p.judgeHint }, facts: slimFacts(x), note: x.note || null, also: gaIn[id] ? 'g' : null, piece: piece['d' + id] };
  if (x.c66) c66.judged.push(id);
  if (x.hintHint) c66.hintHint.push([id, x.hintHint]);
  for (const h of e.hits) h12[`${id}↔${h.other}`] = { hint: e.id, other: h.other, overlap: h.bestStr || null, hintVerdict: x.verdict, sameFactWithOther: x.verdict === 'fix' && (cited.size ? cited.has(String(h.other)) : true), reason: x.reason };
}
const gAlsoD = Object.keys(g002Rest).filter((k) => dBy[k]);

// ── 사실
const fv = {}; for (const k of ['t1', 't2', 'u1', 'u2', 'v1', 'v2', 'v3']) if (exists(k)) for (const x of L(k)) (fv[x.key] ||= []).push({ ...x, from: k });
const true40 = {}; const t40 = J(R + '/_work/true40.json');
for (const p of t40) true40[p.key] = null;
const t40keys = new Set(['t1', 't2'].flatMap((k) => J(`${R}/_work/${k}.refs.json`)));
for (const k of ['t1', 't2', 'u1', 'u2']) for (const x of L(k)) { true40[x.key] = { verdict: x.verdict, claims: x.claims, from: k }; }
const flat = Object.values(true40).flatMap((v) => v.claims);
const t40stats = { items: Object.keys(true40).length, claims: flat.length, ...cnt(flat, (c) => c.result), basis: cnt(flat, (c) => c.basis || 'web') };
const doubtFacts = {}; let dfl = [];
for (const k of ['v1', 'v2', 'v3']) if (exists(k)) for (const x of L(k)) { doubtFacts[x.key] = { verdict: x.verdict, claims: x.claims, from: k }; dfl = dfl.concat(x.claims); }
const t3 = exists('t3') ? L('t3') : [];
const t3map = Object.fromEntries(t3.map((x) => [x.key, { verdict: x.verdict, claims: x.claims }]));

// ── 통계
const fixRate = (arr) => arr.length ? +(arr.filter((x) => x.verdict === 'fix').length / arr.length * 100).toFixed(1) : null;
const gaF = Object.values(g002Rest), naF = Object.values(g004Gen).filter((x) => x.verdict !== 'na'), daF = Object.values(h12ByHint);
const catCnt = (arr) => cnt(arr.filter((x) => x.verdict === 'fix').flatMap((x) => x.categories), (c) => c);
const stats = {
  ga: { n: gaF.length, ok: gaF.filter((x) => x.verdict === 'ok').length, fix: gaF.filter((x) => x.verdict === 'fix').length, fixPct: fixRate(gaF), byPiece: Object.fromEntries(['g1', 'g2', 'g3'].map((k) => { const a = gaF.filter((x) => x.piece === k); return [k, { n: a.length, fix: a.filter((x) => x.verdict === 'fix').length, pct: fixRate(a) }]; })), categories: catCnt(gaF), by: cnt(gaF.filter((x) => x.verdict === 'fix'), (x) => x.by), alsoInDa: gAlsoD.length, afterVsBefore: cnt(gaF, (x) => String(x.afterVsBefore).split(/[ —]/)[0]), doubt: gaF.filter((x) => x.doubt).length, doubtNotOpened: gaF.filter((x) => x.doubt && !x.webOpened).length },
  na: { n: naF.length, ok: naF.filter((x) => x.verdict === 'ok').length, fix: naF.filter((x) => x.verdict === 'fix').length, fixPct: fixRate(naF), afterVsBefore: cnt(naF, (x) => String(x.afterVsBefore).split(/[ —]/)[0]), worse: naF.filter((x) => String(x.afterVsBefore).startsWith('worse')).map((x) => x.id || x.ref), categories: catCnt(naF), byField: cnt(naF, (x) => x.field + '/' + x.verdict) },
  da: { n: daF.length, ok: daF.filter((x) => x.verdict === 'ok').length, fix: daF.filter((x) => x.verdict === 'fix').length, fixPct: fixRate(daF), categories: catCnt(daF), pairKeys: Object.keys(h12).length, c66Judged: c66.judged.length, hintHintNotes: c66.hintHint.length, withProposal: daF.filter((x) => x.proposal.hint).length },
  proposals: { total: 0, byVerifyReplaced: Object.keys(ov).length, noProposal: [] },
  facts: { true40: t40stats, doubtOpened: { items: Object.keys(doubtFacts).length, claims: dfl.length, ...cnt(dfl, (c) => c.result) }, t3: { items: t3.length, ...cnt(t3.flatMap((x) => x.claims), (c) => c.result) } },
};
const allFix = [...gaF.map((x) => ['g' + x.id, x]), ...naF.map((x) => ['n' + (x.id || x.ref) + x.field, x]), ...daF.map((x) => ['d' + x.id, x])].filter((z) => z[1].verdict === 'fix');
stats.proposals.total = allFix.length;
stats.proposals.noProposal = allFix.filter((z) => !z[1].proposal.hint && !z[1].proposal.question && !z[1].proposal.explanation).map((z) => z[0]);

const out = {
  round: 'V008', date: new Date().toISOString().slice(0, 10), model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)',
  web: J(R + '/_work/web.json'),
  counts: { activeDb: summary.activeDb, ga: gaF.length, na: naF.length + 1, naJudged: naF.length, da: daF.length, daPairKeys: Object.keys(h12).length, g002Rows: summary.ga.generalHint, g002Mid484: summary.ga.mid484, v007Sample: summary.ga.sample50, gaRest: summary.ga.rest },
  stats, g002Rest, g004Gen, h12, h12ByHint, c66Like: { judged: c66.judged, hintHint: c66.hintHint, machineScan: J(SC + '/c66-scan.json') },
  flipped: J(R + '/_work/flipped.json'), true40, doubtFacts, proposalFacts: t3map,
};
fs.writeFileSync(A + '/v008-results.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(stats, null, 1));
