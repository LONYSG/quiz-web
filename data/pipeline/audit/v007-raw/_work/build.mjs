// V007 합치기 — 판정자 j1~j8 + VERIFY override + 사실 표본 t1~t3 → data/pipeline/audit/v007-results.json (+ 보고서용 조각 파일)
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v007-raw';
const W = RAW + '/_work';
const OUT = 'C:/work/quiz-web/data/pipeline/audit/v007-results.json';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { assertiveWords, answerFragments, blankCheck } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const { findAnswerInQuestion } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

const items = new Map(J(SC + '/items.json').map((x) => [x.ref, x]));
const s50 = new Map(J(SC + '/sample50.json').map((x) => [x.id, x]));
const p29 = new Map(J(SC + '/pairs29.json').map((x) => [x.id, x]));
const border = new Set([...items.values()].filter((x) => x.selfJudge !== '좋은 어려움').map((x) => x.ref));
const okSample = new Set(J(SC + '/oksample-refs.json'));
const ambig = new Set(J(SC + '/ambig-refs.json'));
const preOpen = J(W + '/items-webopenpre.json');

// override 합치기
const OV = {}; for (let i = 1; i <= 8; i++) { const f = `${W}/ov-j${i}.json`; if (fs.existsSync(f)) Object.assign(OV, J(f)); }

// ── (가) 490
const g003 = {}; const flipped = [];
const pieceStat = {};
for (let i = 1; i <= 7; i++) {
  const arr = J(`${RAW}/j${i}.out.json`);
  pieceStat['j' + i] = { n: arr.length, ...cnt(arr, (r) => r.verdict) };
  for (const r of arr) {
    const x = items.get(r.ref); const o = OV[r.ref] || {};
    const eff = { ...r };
    eff.judgeVerdict = r.verdict;
    if (o.verdict) eff.verdict = o.verdict;
    if (o.categories) eff.categories = o.categories;
    if (o.reason) eff.reason = o.reason;
    eff.proposal = { question: null, explanation: null, hint: null, variants: null, layer: null, score: null, ...(r.proposal || {}), ...(o.proposal || {}) };
    if (eff.verdict === 'ok') eff.proposal = { question: null, explanation: null, hint: null, variants: null, layer: eff.proposal.layer, score: null };
    const wasRead = r.verdict !== 'ok' || border.has(r.ref) || okSample.has(r.ref) || ambig.has(r.ref) || !!OV[r.ref];
    eff.read = { hintAlone: r.hintRead?.alone ?? null, hintRules: r.hintRead?.rules ?? null, verifyReread: wasRead, how: r.verdict !== 'ok' ? 'nonok' : border.has(r.ref) ? 'border' : okSample.has(r.ref) ? 'ok10' : ambig.has(r.ref) ? 'ambig' : OV[r.ref] ? 'override' : null, rereadNote: o.reread ?? null, judgeVerdict: r.verdict };
    if (o.verdict && o.verdict !== r.verdict) flipped.push({ ref: r.ref, from: r.verdict, to: o.verdict, why: o.reread || '' });
    g003[r.ref] = {
      verdict: eff.verdict, categories: eff.categories || [], reason: eff.reason, proposal: eff.proposal, proposalSource: o.proposalSource ?? null,
      facts: r.webOpened ? (r.facts || []) : [{ claim: `GEN facts ${x.facts.length}개 — VERIFY 미확인`, result: 'gen-web', basis: 'gen', source: null }],
      webOpened: !!r.webOpened, factsGenCount: x.facts.length,
      score: { dif: r.score.dif, difWhy: r.score.difWhy, wor: r.score.wor ?? null, acc: r.score.acc ?? null, gen: { dif: x.score.dif, wor: x.score.wor, acc: x.score.acc } },
      depth: r.depth ?? null, dup: r.dup ?? null, read: eff.read, note: r.note ?? null,
      topic: x.topic, mid: x.mid, answer: x.answer, selfJudge: x.selfJudge, hasHint: !!x.hint, webOpenPre: preOpen[r.ref],
    };
  }
}
const refsAll = [...items.keys()];
const missing = refsAll.filter((r) => !g003[r]);

// ── 제안 기계 검사 (hint / question)
const propCheck = { hint: { n: 0, block: [], warn: {} }, question: { n: 0, bad: [], assertive: [] }, long: [] };
for (const [ref, g] of Object.entries(g003)) {
  const x = items.get(ref); const p = g.proposal;
  if (g.verdict === 'fix' || g.verdict === 'drop') {
    if (p.hint) {
      propCheck.hint.n++;
      const r = checkHint({ hint: p.hint, answer: x.answer, variants: p.variants || x.variants || [], question: p.question || x.question, explanation: p.explanation || x.explanation || '' });
      if (r.block.length || [...p.hint].length > 120 || /\n/.test(p.hint)) propCheck.hint.block.push({ ref, block: r.block, len: [...p.hint].length });
      for (const w of r.warn) propCheck.hint.warn[w.kind] = (propCheck.hint.warn[w.kind] || 0) + 1;
    }
    if (p.question) {
      propCheck.question.n++;
      const ex = findAnswerInQuestion(p.question, x.answer); const bl = blankCheck(p.question, x.answer);
      const exv = (p.variants || x.variants || []).map((v) => findAnswerInQuestion(p.question, v)).filter((z) => z !== 'none');
      if (ex !== 'none' || !bl.ok || exv.length) propCheck.question.bad.push({ ref, ex, blank: bl.ok, exv });
      const aw = assertiveWords(p.question); if (aw.length) propCheck.question.assertive.push({ ref, words: aw.map((h) => h.words.join('/')) });
    }
  }
}
// 제안 힌트 줄바꿈/길이 이미 포함. 새 사실 근거
const propFacts = { total: 0, web: 0, knowledge: 0 };
for (const [ref, g] of Object.entries(g003)) for (const f of g.facts) if (f.proposal) { propFacts.total++; if (f.basis === 'web') propFacts.web++; else propFacts.knowledge++; }

// ── 통계
const ver = cnt(Object.values(g003), (g) => g.verdict);
const byTopic = {}; for (const g of Object.values(g003)) { byTopic[g.topic] = byTopic[g.topic] || { ok: 0, fix: 0, drop: 0, unsure: 0 }; byTopic[g.topic][g.verdict]++; }
const catCount = {}; for (const g of Object.values(g003)) if (g.verdict !== 'ok') for (const c of g.categories) catCount[c] = (catCount[c] || 0) + 1;
const difNew = cnt(Object.values(g003), (g) => g.score.dif); const difGen = cnt(Object.values(g003), (g) => g.score.gen.dif);
const difMatrix = cnt(Object.values(g003), (g) => g.score.gen.dif + '->' + g.score.dif);
const difByTopic = {}; for (const g of Object.values(g003)) { const t = (difByTopic[g.topic] ||= { n: 0, up: 0, down: 0, same: 0, gen45: 0, new45: 0, genDist: {}, newDist: {} }); t.n++; const d = g.score.dif - g.score.gen.dif; if (d > 0) t.up++; else if (d < 0) t.down++; else t.same++; if (g.score.gen.dif >= 4) t.gen45++; if (g.score.dif >= 4) t.new45++; t.genDist[g.score.gen.dif] = (t.genDist[g.score.gen.dif] || 0) + 1; t.newDist[g.score.dif] = (t.newDist[g.score.dif] || 0) + 1; }
const borderDir = cnt(Object.values(g003), (g) => { const m = g.score.difWhy.match(/경계\s*(\d)/); return g.score.dif + (m ? '/경계' + m[1] : ''); });
const worDiff = Object.entries(g003).filter(([, g]) => g.score.wor != null && g.score.wor !== g.score.gen.wor).map(([ref, g]) => ({ ref, from: g.score.gen.wor, to: g.score.wor }));
const noHintNeeded = Object.entries(g003).filter(([ref, g]) => !g.hasHint && g.score.dif >= 3).map(([ref, g]) => ({ ref, dif: g.score.dif, answer: g.answer }));
const hintExtra = Object.entries(g003).filter(([ref, g]) => g.hasHint && g.score.dif <= 2).map(([ref, g]) => ({ ref, dif: g.score.dif, answer: g.answer }));
const hintRules = { shapeOnly: 0, wrongName: 0, pairSame: 0 };
for (const g of Object.values(g003)) { const c = g.categories; if (c.includes('shape-only') || c.includes('shape')) hintRules.shapeOnly++; if (c.includes('wrong-name')) hintRules.wrongName++; if (c.includes('pair-same')) hintRules.pairSame++; }
const hintCats = ['spoon-feed', 'famous-one', 'meaning', 'shape-only', 'shape', 'wrong-name', 'pair-same', 'letters', 'alias', 'h-error', 'explain-overlap', 'question-repeat', 'weak'];
const hintFixItems = Object.entries(g003).filter(([, g]) => g.verdict === 'fix' && g.categories.some((c) => hintCats.includes(c)));
const wor2 = Object.entries(g003).filter(([ref]) => items.get(ref).score.wor === 2).map(([ref, g]) => ({ ref, answer: g.answer, verdict: g.verdict, layer: items.get(ref).layer, work: items.get(ref).work, why: g.score.difWhy }));

// ── 사실
const factsAgg = { claims: 0, true: 0, false: 0, unverified: 0, web: 0, knowledge: 0, openedItems: 0, notOpenedItems: 0, genFactsNotOpened: 0 };
const falseList = [], unverifiedList = [];
for (const [ref, g] of Object.entries(g003)) {
  if (g.webOpened) { factsAgg.openedItems++; for (const f of g.facts) { if (f.proposal) continue; factsAgg.claims++; factsAgg[f.result] = (factsAgg[f.result] || 0) + 1; factsAgg[f.basis === 'web' ? 'web' : 'knowledge']++; if (f.result === 'false') falseList.push({ ref, claim: f.claim, where: f.where, source: f.source }); if (f.result === 'unverified') unverifiedList.push({ ref, claim: f.claim, where: f.where, basis: f.basis }); } }
  else { factsAgg.notOpenedItems++; factsAgg.genFactsNotOpened += g.factsGenCount; }
}
// t60
const t60 = { items: 0, claims: 0, tally: { true: 0, false: 0, unverified: 0 }, falseList: [], unverifiedList: [], byItem: {} };
for (const k of [1, 2, 3]) { const f = `${RAW}/t${k}.out.json`; if (!fs.existsSync(f)) continue; for (const r of J(f)) { t60.items++; t60.byItem[r.ref] = r.claims; for (const c of r.claims) { t60.claims++; t60.tally[c.result] = (t60.tally[c.result] || 0) + 1; if (c.result === 'false') t60.falseList.push({ ref: r.ref, ...c }); if (c.result === 'unverified') t60.unverifiedList.push({ ref: r.ref, claim: c.claim, where: c.where, note: c.note }); } } }
for (const [ref, claims] of Object.entries(t60.byItem)) { g003[ref].t60 = claims; g003[ref].facts = claims.map((c) => ({ claim: c.claim, where: c.where, result: c.result, basis: 'web', source: c.source ?? null, note: c.note ?? null })); g003[ref].webOpened = true; g003[ref].webOpenedBy = 't60'; }

// ── (나) / (다)
const j8 = J(`${RAW}/j8.out.json`); const g002Sample = {}; const pairs29 = {};
for (const r of j8) {
  const o = OV[String(r.id)] || {};
  const rec = { ...r, judgeVerdict: r.verdict, proposal: { hint: null, ...(r.proposal || {}), ...(o.proposal || {}) }, proposalSource: o.proposalSource ?? null, reread: o.reread ?? null };
  if (r.set === 'n') { const x = s50.get(r.id); g002Sample[r.id] = { ...rec, group: x.group, answer: x.answer, before: x.before, after: x.after, by: x.by, status: x.status, v006: x.v006 }; }
  else { const x = p29.get(r.id); pairs29[r.id] = { ...rec, answer: x.answer, group: x.group, pairIds: x.pairIds, hint: x.hint }; }
}
const nStat = cnt(Object.values(g002Sample), (r) => r.verdict); const nGroup = {}; for (const r of Object.values(g002Sample)) { nGroup[r.group] = nGroup[r.group] || { ok: 0, fix: 0 }; nGroup[r.group][r.verdict]++; }
const dStat = cnt(Object.values(pairs29), (r) => r.verdict);
for (const r of Object.values({ ...g002Sample, ...pairs29 })) if (r.proposal?.hint) { const x = s50.get(r.id) || p29.get(r.id); const c = checkHint({ hint: r.proposal.hint, answer: x.answer, variants: x.variants || [], question: x.question, explanation: x.explanation || '' }); if (c.block.length || [...r.proposal.hint].length > 120) propCheck.hint.block.push({ ref: '#' + r.id, block: c.block }); propCheck.hint.n++; }

// ── 누적·중복
const setup = J(W + '/summary.json');
const dupscan = J(SC + '/dupscan.json');
const dbCheck16 = [...items.values()].filter((x) => x.sameAnswerActive.length === 1).map((x) => ({ ref: x.ref, answer: x.answer, activeId: x.sameAnswerActive[0].id, verdict: g003[x.ref].verdict, dup: g003[x.ref].dup, selfDbCheck: x.dbCheck }));

// ── 직접 재독 수
const readN = { nonok: 0, border: 0, ok10: 0, ambig: 0, override: 0, total: 0 };
for (const g of Object.values(g003)) { if (g.read.verifyReread) { readN.total++; readN[g.read.how] = (readN[g.read.how] || 0) + 1; } }
const okJudge = Object.values(g003).filter((g) => g.read.judgeVerdict === 'ok').length;
const flipOk = flipped.filter((f) => f.from === 'ok').length, flipFromNonOk = flipped.filter((f) => f.from !== 'ok').length;

const result = {
  round: 'V007', date: '2026-10-14', task: 'G003 상 생성 1차 490 판정 (C64 — 적재 전) + G002 가 바꾼 중 힌트 표본 50 + 같은 정답 쌍 ok 쪽 29 (Q-109 나)',
  source: 'data/pipeline/audit/g003-verify-targets.json · g002-fixes.json · v006-results.json',
  model: 'Sonnet 5.5 (VERIFY 세션 + 판정자 조각 j1~j8 · 사실 확인 t1~t3 — 모두 같은 모델, v007-raw/RUBRIC.md 공유). 생성자 GEN 은 Opus 5.5',
  web: { note: '판정자 · 사실 확인자 보고 합계는 보고서 0절 · VERIFY 직접 WebFetch/WebSearch 는 보고서 0절' },
  counts: { g003: Object.keys(g003).length, missing: missing.length, g002Sample: Object.keys(g002Sample).length, pairs29: Object.keys(pairs29).length, verdict: ver },
  stats: { verdict: ver, byTopic, categories: catCount, pieceStat, difGen, difNew, difMatrix, difByTopic, borderDir, worDiff, noHintNeeded, hintExtra, hintRules, hintFixCount: hintFixItems.length, wor2, facts: factsAgg, falseList, unverifiedList, propFacts, propCheck, readN, okJudge, flipOk, flipFromNonOk, dbCheck16, dupscan: dupscan.map((d) => ({ ref: d.ref, answer: d.answer, id: d.id, activeAnswer: d.activeAnswer, dir: d.dir, overlap: d.overlap })), cumulative: setup.cumulative, warn: setup.warn },
  g003, g002Sample, pairs29, flipped, true60: { items: t60.items, claims: t60.claims, tally: t60.tally, falseList: t60.falseList, unverifiedList: t60.unverifiedList },
  g002SampleStats: { verdict: nStat, byGroup: nGroup }, pairs29Stats: { verdict: dStat },
};
fs.writeFileSync(OUT, JSON.stringify(result));
fs.writeFileSync(W + '/build-summary.json', JSON.stringify({ counts: result.counts, stats: { ...result.stats, wor2: undefined, dbCheck16: undefined, unverifiedList: undefined }, nStat, nGroup, dStat, t60: { items: t60.items, claims: t60.claims, tally: t60.tally } }, null, 1));
console.log(JSON.stringify({ verdict: ver, missing: missing.length, flipped: flipped.length, readN, okJudge, nStat, nGroup, dStat, t60: { items: t60.items, claims: t60.claims, tally: t60.tally }, propBlock: propCheck.hint.block, qbad: propCheck.question.bad, qassert: propCheck.question.assertive, propFacts, hintRules, factsAgg }, null, 1));
