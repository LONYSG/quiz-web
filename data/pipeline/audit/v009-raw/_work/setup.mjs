// V009 setup — 대상 확인(원칙 7) · DB 읽기 전용 대조 · blind 판정자 입력(조각 4)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { assertiveWords, answerFragments, blankCheck } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const { findAnswerInQuestion } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const SC = process.env.V9SC;
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v009-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();

const T = J(A + '/g005-verify-targets.json').targets;
const flow = J(A + '/g005-flow.json');
const summary = {
  targets: T.length, refsUnique: new Set(T.map((x) => x.ref)).size, topic: cnt(T, (x) => x.topic), genDif: cnt(T, (x) => x.score.dif), genTop: T.filter((x) => x.score.dif >= 4).length,
  wor: cnt(T, (x) => x.score.wor), method: cnt(T, (x) => x.method), rewrite: cnt(T, (x) => (x.rewrite ? String(x.rewrite.changed) : 'none')), hint: T.filter((x) => x.hint).length,
  hintBasis: cnt(T.filter((x) => x.hint), (x) => x.hintBasis), variantsItems: T.filter((x) => x.variants?.length).length, variantsN: T.reduce((s, x) => s + (x.variants?.length || 0), 0),
  originalTitle: T.filter((x) => x.originalTitleVariants?.length).length, selfJudge: cnt(T, (x) => x.selfJudge), layer: cnt(T, (x) => x.layer),
  facts: T.reduce((s, x) => s + x.facts.length, 0), knowledgeClaims: T.reduce((s, x) => s + (x.knowledgeClaims?.length || 0), 0), paired: T.filter((x) => x.pairedWith).length,
  flowKeys: Object.keys(flow),
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.difficulty_score, q.source_ref from questions q where q.is_active`)).rows;
const ans = (await c.query(`select a.question_id, a.answer_text, a.answer_norm, a.is_primary from question_answers a join questions q on q.id=a.question_id where q.is_active`)).rows;
const g005 = (await c.query(`select count(*)::int n from questions where source_ref like '%#g005-%'`)).rows[0].n;
await c.end();
summary.activeDb = rows.length; summary.g005InDb = g005;
const qById = new Map(rows.map((r) => [Number(r.id), r]));
const primNorm = new Map(); for (const a of ans) if (a.is_primary) { if (!primNorm.has(a.answer_norm)) primNorm.set(a.answer_norm, []); primNorm.get(a.answer_norm).push(Number(a.question_id)); }
const anyNorm = new Map(); for (const a of ans) { if (!anyNorm.has(a.answer_norm)) anyNorm.set(a.answer_norm, new Set()); anyNorm.get(a.answer_norm).add(Number(a.question_id)); }
const slim = (id) => { const r = qById.get(id); return r && { id, answer: r.display_answer, dif: r.difficulty_score, question: r.question_text, explanation: r.explanation }; };

// 약한 출처 (G005 2절 · 3절 — 에이전트 보고)
const weakSrc = new Set(['까나리카노', '가족오락관', '인생극장', '관심법', '부라보콘', '빅마마', '비금도', '코너킥', '회혼례']);
const weakVar = ['회혼식', '숀더쉽', '코나미', '윌헬름'];
const weakHintRef = new Set(['K4-06', 'K4-12', 'K4-27', 'K4-19', 'A1-03', 'L2-20', 'H2-21', 'H1-18', 'M2-14']);
const thinHintRef = ['월복', '브라에스의 역설', '미스김 라일락', '머슴날', '3.3 혁명', '혜존', '체질량지수', '뚱딴지', '가슴샘', '영종도', '카르보나라'];
const items = T.map((x) => {
  const n = normalizeAnswer(x.answer);
  const same = (primNorm.get(n) || []).map(slim).filter(Boolean);
  const alias = [...(anyNorm.get(n) || [])].filter((id) => !(primNorm.get(n) || []).includes(id)).map(slim).filter(Boolean);
  const paired = x.pairedWith ? slim(Number(x.pairedWith)) : null;
  const aw = assertiveWords(x.question).concat(assertiveWords(x.explanation || ''));
  const awH = assertiveWords(x.hint || '');
  const fr = answerFragments(x.question, x.answer);
  const chk = x.hint ? checkHint({ hint: x.hint, answer: x.answer, variants: x.variants || [], question: x.question, explanation: x.explanation || '' }) : null;
  const why = [];
  if (aw.length || awH.length) why.push('단정어 ' + [...aw, ...awH].map((h) => h.words.join('/')).join(','));
  if (x.facts.some((f) => /namu/.test(f.url || ''))) why.push('나무위키 근거');
  if (weakSrc.has(x.answer) || [...weakSrc].some((w) => x.answer.includes(w))) why.push('출처 약함(G005 2절)');
  if (x.variants?.some((v) => weakVar.some((w) => v.includes(w))) || weakVar.some((w) => x.answer.includes(w))) why.push('변형 표기 약함');
  if (x.hintBasis === 'knowledge') why.push('지식 힌트');
  if (weakHintRef.has(x.ref)) why.push('출처 약한 힌트');
  if (same.length || alias.length) why.push('같은 정답 활성');
  if (x.method === '가') why.push('2회차');
  if (x.rewrite?.changed) why.push('고친 질문(새 단서 사실)');
  if (x.score.wor === 2) why.push('미디어 알 가치 2');
  const thin = thinHintRef.some((t) => x.answer === t || x.answer.startsWith(t));
  return { ...x, norm: n, sameAnswerActive: same, aliasMatchActive: alias, paired, warn: { assert: aw.map((h) => h.words.join('/')), assertHint: awH.map((h) => h.words.join('/')), frag: fr.map((h) => h.frag), hint: chk ? chk.warn.map((w) => w.kind) : [], hintBlock: chk ? chk.block.length : 0 }, exposure: findAnswerInQuestion(x.question, x.answer), blank: blankCheck(x.question, x.answer).ok, webOpenPre: why, thinHint: thin };
});
summary.warn = { assert: items.filter((x) => x.warn.assert.length).length, assertAny: items.filter((x) => x.warn.assert.length || x.warn.assertHint.length).length, frag: items.filter((x) => x.warn.frag.length).length, hintBlock: items.filter((x) => x.warn.hintBlock).length, exposure: cnt(items, (x) => x.exposure), blankBad: items.filter((x) => !x.blank).length, sameActive: items.filter((x) => x.sameAnswerActive.length).length, aliasActive: items.filter((x) => x.aliasMatchActive.length).length, webOpenPre: items.filter((x) => x.webOpenPre.length).length, thin: items.filter((x) => x.thinHint).map((x) => x.ref) };
const targetsNorm = cnt(items, (x) => x.norm);
summary.cumulative = { dist: cnt(items, (x) => x.sameAnswerActive.length + (targetsNorm[x.norm] - 1) + 1), targetDup: items.filter((x) => targetsNorm[x.norm] > 1).map((x) => x.ref) };
fs.writeFileSync(SC + '/items.json', JSON.stringify(items, null, 1));

// 조각 4 — id 해시로 섞는다(묶음 편중 없이)
const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const sorted = [...items].sort((a, b) => hash(a.ref) - hash(b.ref));
const pcs = Object.fromEntries([1,2,3,4,5,6,7,8].map((i) => ['p' + i, []])); sorted.forEach((x, i) => pcs['p' + ((i % 8) + 1)].push(x));
for (const k of Object.keys(pcs)) pcs[k].sort((a, b) => (a.ref < b.ref ? -1 : 1));
const manifest = {};
const fmt = (x) => {
  const L = [];
  L.push(`### ${x.ref}  [${x.topic}/${x.mid}/${x.sub}]  method=${x.method}${x.pairedWith ? ' pairedWith=#' + x.pairedWith : ''}${x.layer ? ' layer=' + x.layer : ''}${x.work ? ' work=' + x.work : ''}`);
  L.push(`Q: ${one(x.question)}`);
  L.push(`A: ${x.answer}${x.variants?.length ? '   변형: ' + x.variants.join(' | ') : ''}${x.originalTitleVariants?.length ? '   originalTitle: ' + x.originalTitleVariants.join(' | ') : ''}${x.variantCheck ? '   variantCheck(GEN): ' + one(typeof x.variantCheck === 'string' ? x.variantCheck : JSON.stringify(x.variantCheck)) : ''}`);
  L.push(`E: ${one(x.explanation)}`);
  L.push(`H: ${x.hint ? one(x.hint) : '(힌트 없음)'}${x.hint ? `   hintBasis=${x.hintBasis}   hintSources: ${(x.hintSources || []).join(' ; ')}   hintNote: ${one(x.hintNote)}` : ''}${x.thinHint ? '   [G005 가 힘이 약하다/세기가 걸린다고 적은 힌트 — 직접 판정]' : ''}`);
  if (x.rewrite?.changed) L.push(`REWRITE(고친 질문 — 227): before Q: ${one(x.rewrite.before)} | before E: ${one(x.rewrite.beforeExplanation)} | addedCue(GEN): ${one(x.rewrite.addedCue)}`);
  else if (x.rewrite?.changed === false) L.push(`REWRITE(고치지 않음): ${one(x.rewrite.why)}`);
  L.push('facts: ' + x.facts.map((f) => `[${f.where}] ${one(f.claim)} <${f.url}> «${one(f.note).slice(0, 150)}»`).join('  ||  '));
  if (x.knowledgeClaims?.length) L.push('knowledgeClaims(지식 근거): ' + JSON.stringify(x.knowledgeClaims));
  L.push(`dbCheck(GEN): ${one(x.dbCheck)}${x.pairCheck ? '   pairCheck(GEN): ' + one(x.pairCheck) : ''}`);
  if (x.paired) L.push(`  1회차 #${x.paired.id} (${x.paired.answer}): Q: ${one(x.paired.question)} | E: ${one(x.paired.explanation)}`);
  for (const s of x.sameAnswerActive) L.push(`  sameAnswerActive #${s.id}: Q: ${one(s.question)} | E: ${one(s.explanation)}`);
  for (const s of x.aliasMatchActive) L.push(`  aliasMatchActive #${s.id} 답=${s.answer}: Q: ${one(s.question)} | E: ${one(s.explanation)}`);
  L.push(`warn: assert=[${x.warn.assert.join(',')}] assertHint=[${x.warn.assertHint.join(',')}] frag=[${x.warn.frag.join(',')}] hint=[${x.warn.hint.join(',')}]`);
  L.push(`webOpen: ${x.webOpenPre.length ? 'TRUE (' + x.webOpenPre.join(', ') + ')' : 'false (재채점 결과 4~5 면 TRUE)'}`);
  L.push('');
  return L.join('\n');
};
for (const [k, arr] of Object.entries(pcs)) {
  fs.writeFileSync(`${RAW}/_work/${k}.txt`, arr.map(fmt).join('\n'));
  fs.writeFileSync(`${RAW}/_work/${k}.refs.json`, JSON.stringify(arr.map((x) => x.ref)));
  manifest[k] = { n: arr.length, topics: cnt(arr, (x) => x.topic), hint: arr.filter((x) => x.hint).length, rewriteChanged: arr.filter((x) => x.rewrite?.changed).length, webOpenPre: arr.filter((x) => x.webOpenPre.length).length, variants: arr.filter((x) => x.variants?.length).length };
}
fs.writeFileSync(RAW + '/_work/manifest.json', JSON.stringify(manifest, null, 1));
fs.writeFileSync(RAW + '/_work/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1)); console.log(JSON.stringify(manifest));
for (const k of Object.keys(manifest)) console.log(k, fs.statSync(`${RAW}/_work/${k}.txt`).size);
