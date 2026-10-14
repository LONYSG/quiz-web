// V007 setup — 대상 확인(원칙 7) · checkHint · DB 읽기 전용 대조 · (나) 표본 50 · (다) 29 · 조각 입력
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { assertiveWords, answerFragments, blankCheck } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const { findAnswerInQuestion } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const { questionWords } = await import('file:///C:/work/quiz-web/scripts/hint-input.mjs');
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v007-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

const T = J(A + '/g003-verify-targets.json').targets;
const G2 = J(A + '/g002-fixes.json');
const V6 = J(A + '/v006-results.json');
const R47 = J(A + '/r047-verify-targets.json').midHints.targets;
const r47 = new Map(R47.map((x) => [x.id, x]));

// ── 원칙 7: 건수
const summary = {
  targets: T.length, refsUnique: new Set(T.map((x) => x.ref)).size,
  topic: cnt(T, (x) => x.topic), dif: cnt(T, (x) => x.score.dif), wor: cnt(T, (x) => x.score.wor),
  method: cnt(T, (x) => x.method), paired: T.filter((x) => x.pairedWith).length,
  hint: T.filter((x) => x.hint).length, hintBasis: cnt(T.filter((x) => x.hint), (x) => x.hintBasis),
  selfJudge: cnt(T, (x) => x.selfJudge), wor2: T.filter((x) => x.score.wor === 2).length, wor2media: T.filter((x) => x.score.wor === 2 && x.topic === 'media').length,
  facts: T.reduce((s, x) => s + x.facts.length, 0), sources: +(T.reduce((s, x) => s + x.sources.length, 0) / T.length).toFixed(2),
  noHintDif: cnt(T.filter((x) => !x.hint), (x) => x.score.dif), hintDif: cnt(T.filter((x) => x.hint), (x) => x.score.dif),
  sj경계: T.filter((x) => x.selfJudge === '경계').length, sj나쁨: T.filter((x) => x.selfJudge === '나쁜 어려움 의심').map((x) => x.ref),
};
const gh = G2.rows.filter((r) => r.field === 'general_hint');
const mid484 = gh.filter((r) => r47.has(r.id));
summary.g002 = { rows: G2.rows.length, generalHint: gh.length, inMidHints: mid484.length, notInMid: gh.filter((r) => !r47.has(r.id)).map((r) => r.id), byVerify: cnt(mid484, (r) => r.by), counts: G2.counts };

// ── DB (읽기 전용)
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const act = await c.query('select count(*)::int n from questions where is_active');
summary.activeDb = act.rows[0].n;
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.difficulty_score, q.worth_knowing, q.accessibility, q.is_active, q.category_id
  from questions q where q.is_active`)).rows;
const ans = (await c.query(`select a.question_id, a.answer_text, a.answer_norm, a.is_primary from question_answers a join questions q on q.id=a.question_id where q.is_active`)).rows;
await c.end();
const qById = new Map(rows.map((r) => [Number(r.id), r]));
const ansBy = new Map();
for (const a of ans) { const k = Number(a.question_id); if (!ansBy.has(k)) ansBy.set(k, []); ansBy.get(k).push(a); }
const primNorm = new Map(); // answer_norm(primary) -> [ids]
for (const a of ans) if (a.is_primary) { if (!primNorm.has(a.answer_norm)) primNorm.set(a.answer_norm, []); primNorm.get(a.answer_norm).push(Number(a.question_id)); }
const anyNorm = new Map(); // any answer row
for (const a of ans) { if (!anyNorm.has(a.answer_norm)) anyNorm.set(a.answer_norm, new Set()); anyNorm.get(a.answer_norm).add(Number(a.question_id)); }
const variantsOf = (id) => (ansBy.get(id) || []).filter((a) => !a.is_primary).map((a) => a.answer_text);
const slim = (id) => { const r = qById.get(id); return r && { id, answer: r.display_answer, variants: variantsOf(id), dif: r.difficulty_score, question: r.question_text, explanation: r.explanation, hint: r.general_hint }; };

// ── (가) 490 보강
const targetsNorm = cnt(T, (x) => normalizeAnswer(x.answer));
const items = T.map((x) => {
  const n = normalizeAnswer(x.answer);
  const same = (primNorm.get(n) || []).map(slim);
  const alias = [...(anyNorm.get(n) || [])].filter((id) => !(primNorm.get(n) || []).includes(id)).map(slim);
  const aw = assertiveWords(x.question).concat(assertiveWords(x.explanation || ''));
  const awH = assertiveWords(x.hint || '');
  const fr = answerFragments(x.question, x.answer);
  const chk = x.hint ? checkHint({ hint: x.hint, answer: x.answer, variants: x.variants || [], question: x.question, explanation: x.explanation || '' }) : null;
  return {
    ...x, norm: n, sameAnswerActive: same, aliasMatchActive: alias, targetsSameAnswer: targetsNorm[n],
    warn: { assert: aw.map((h) => h.words.join('/')), assertHint: awH.map((h) => h.words.join('/')), frag: fr.map((h) => h.frag), hint: chk ? chk.warn.map((w) => w.kind) : [], hintBlock: chk ? chk.block.length : 0 },
    exposure: findAnswerInQuestion(x.question, x.answer), blank: blankCheck(x.question, x.answer).ok,
    questionWords: x.hint ? questionWords(x.question) : undefined,
  };
});
summary.warn = {
  assert: items.filter((x) => x.warn.assert.length).length, assertWithHint: items.filter((x) => x.warn.assert.length || x.warn.assertHint.length).length, assertQonly: items.filter((x) => assertiveWords(x.question).length).length, frag: items.filter((x) => x.warn.frag.length).length,
  hintExplain: items.filter((x) => x.warn.hint.includes('explain')).length, hintBlock: items.filter((x) => x.warn.hintBlock).length,
  hintWarnKinds: cnt(items.flatMap((x) => x.warn.hint), (k) => k), exposure: cnt(items, (x) => x.exposure), blankBad: items.filter((x) => !x.blank).length,
};
const cumul = {};
for (const x of items) { const k = x.sameAnswerActive.length + (x.targetsSameAnswer - 1) + 1; cumul[k] = (cumul[k] || 0) + 1; }
summary.cumulative = { distActivePlusThis: cumul, activeSame1: items.filter((x) => x.sameAnswerActive.length === 1).length, activeSame2plus: items.filter((x) => x.sameAnswerActive.length >= 2).map((x) => [x.ref, x.answer, x.sameAnswerActive.map((s) => s.id)]), aliasMatch: items.filter((x) => x.aliasMatchActive.length).map((x) => [x.ref, x.answer, x.aliasMatchActive.map((s) => s.id)]), targetDup: items.filter((x) => x.targetsSameAnswer > 1).map((x) => [x.ref, x.answer]) };
fs.writeFileSync(SC + '/items.json', JSON.stringify(items, null, 1));

// ── (나) 표본 50
const special = { suspect: [1518, 3630, 3817], border: [603, 791, 870, 3583, 3792, 3996] };
const spAll = new Set([...special.suspect, ...special.border]);
summary.g002.specialInMid = [...spAll].filter((id) => mid484.some((r) => r.id === id)).length;
let seed = 20261014; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pool = mid484.filter((r) => !spAll.has(r.id)).map((r) => r.id).sort((a, b) => a - b);
const shuf = [...pool]; for (let i = shuf.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuf[i], shuf[j]] = [shuf[j], shuf[i]]; }
const rand41 = shuf.slice(0, 41).sort((a, b) => a - b);
const sampleIds = [...rand41, ...special.suspect, ...special.border];
const g2by = new Map(gh.map((r) => [r.id, r]));
const sample = sampleIds.map((id) => {
  const r = g2by.get(id), cur = qById.get(id), v6 = V6.midHints[id], t = r47.get(id);
  const chk = checkHint({ hint: r.after, answer: cur.display_answer, variants: variantsOf(id), question: cur.question_text, explanation: cur.explanation || '' });
  const n = normalizeAnswer(cur.display_answer);
  return {
    id, group: special.suspect.includes(id) ? '의심' : special.border.includes(id) ? '경계' : '무작위',
    answer: cur.display_answer, variants: variantsOf(id), dif: cur.difficulty_score, path: t.path, question: cur.question_text, explanation: cur.explanation,
    before: r.before, after: r.after, dbHintNow: cur.general_hint, dbEqualsAfter: cur.general_hint === r.after, dbVersion: cur.general_hint_version,
    by: r.by, status: r.status, g002reason: r.reason, g002sources: r.sources,
    v006: { verdict: v6.verdict, categories: v6.categories, reason: v6.reason, proposal: v6.proposal },
    sameAnswerActive: (primNorm.get(n) || []).filter((x) => x !== id).map(slim),
    warn: { hint: chk.warn.map((w) => w.kind), block: chk.block.length },
  };
});
summary.sample = { n: sample.length, groups: cnt(sample, (x) => x.group), dbEqualsAfter: sample.filter((x) => x.dbEqualsAfter).length, by: cnt(sample, (x) => x.by), withSame: sample.filter((x) => x.sameAnswerActive.length).length, blocks: sample.filter((x) => x.warn.block).length };
fs.writeFileSync(SC + '/sample50.json', JSON.stringify(sample, null, 1));

// ── (다) 29 : G002.txt 2절 'ok(그대로' 쪽
const g2txt = fs.readFileSync('C:/work/quiz-web/ai-out/G002.txt', 'utf8').split('\n');
const a2 = g2txt.findIndex((l, i) => i > 100 && l.startsWith('2. 같은 정답 쌍 (B) —'));
const a3 = g2txt.findIndex((l, i) => i > 100 && l.startsWith('3. 반영 결과 (C)'));
const pairLines = g2txt.slice(a2, a3).filter((l) => /^- \d+↔/.test(l));
const pairs = [];
for (const l of pairLines) {
  const m = l.match(/^- ([\d↔]+) \[(.+?)\]: (.*)$/);
  const ids = m[1].split('↔').map(Number);
  const okSide = [...m[3].matchAll(/#(\d+) ok\(그대로/g)].map((z) => Number(z[1]));
  pairs.push({ ids, label: m[2], okSide });
}
const okIds = pairs.flatMap((p) => p.okSide);
summary.pairs = { pairLines: pairLines.length, okSide: okIds.length, dup: okIds.length - new Set(okIds).size };
const pairs29 = pairs.flatMap((p) => p.okSide.map((id) => {
  const cur = qById.get(id), v6 = V6.midHints[id];
  const others = p.ids.filter((x) => x !== id);
  return { id, group: p.label, answer: cur.display_answer, variants: variantsOf(id), dif: cur.difficulty_score, question: cur.question_text, explanation: cur.explanation, hint: cur.general_hint, hintVersion: cur.general_hint_version, v006: { verdict: v6?.verdict, categories: v6?.categories }, others: others.map(slim), pairIds: p.ids };
}));
fs.writeFileSync(SC + '/pairs29.json', JSON.stringify(pairs29, null, 1));
summary.pairs.v006verdicts = cnt(pairs29, (x) => x.v006.verdict);
summary.pairs.missingDb = pairs29.filter((x) => !x.question).map((x) => x.id);

// ── 조각 (묶음별)
const mapTopic = (x) => x.topic;
const groups = {
  P1: items.filter((x) => ['korea', 'sports'].includes(mapTopic(x))),
  P2: items.filter((x) => ['life', 'arts'].includes(mapTopic(x))),
  P3: items.filter((x) => ['media', 'science'].includes(mapTopic(x))),
  P4: items.filter((x) => ['history'].includes(mapTopic(x))),
};
summary.pieces = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
fs.writeFileSync(SC + '/pieces.json', JSON.stringify(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((x) => x.ref)])), null, 1));
fs.writeFileSync(RAW + '/_work/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1).slice(0, 7000));
