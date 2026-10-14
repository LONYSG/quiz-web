// V008 setup — 대상 확인(원칙 7) · (가) 나머지 · (나) GEN 문구 · (다) H12 후보 — DB 읽기 전용
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { questionWords } = await import('file:///C:/work/quiz-web/scripts/hint-input.mjs');
const SC = process.env.V8SC;
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

const G2 = J(A + '/g002-fixes.json');
const G4 = J(A + '/g004-fixes.json');
const R47 = J(A + '/r047-verify-targets.json').midHints.targets;
const r47 = new Map(R47.map((x) => [x.id, x]));
const V6 = J(A + '/v006-results.json');
const V7 = J(A + '/v007-results.json');
const s50 = J(A + '/v007-raw/_work/sample50.json').map((x) => x.id);
const p29 = J(A + '/v007-raw/_work/pairs29.json');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.difficulty_score, q.source_ref, q.category_id from questions q where q.is_active`)).rows;
const ans = (await c.query(`select a.question_id, a.answer_text, a.answer_norm, a.is_primary from question_answers a join questions q on q.id=a.question_id where q.is_active`)).rows;
await c.end();
const qById = new Map(rows.map((r) => [Number(r.id), r]));
const ansBy = new Map();
for (const a of ans) { const k = Number(a.question_id); if (!ansBy.has(k)) ansBy.set(k, []); ansBy.get(k).push(a); }
const variantsOf = (id) => (ansBy.get(id) || []).filter((a) => !a.is_primary).map((a) => a.answer_text);
const normsOf = (id) => [...new Set((ansBy.get(id) || []).map((a) => a.answer_norm))];
const byNorm = new Map(); // answer_norm(any row) -> Set ids
for (const a of ans) { if (!byNorm.has(a.answer_norm)) byNorm.set(a.answer_norm, new Set()); byNorm.get(a.answer_norm).add(Number(a.question_id)); }
const sameOf = (id) => { const s = new Set(); for (const n of normsOf(id)) for (const o of byNorm.get(n) || []) if (o !== id) s.add(o); return [...s]; };
const slim = (id) => { const r = qById.get(id); return r && { id, answer: r.display_answer, variants: variantsOf(id), dif: r.difficulty_score, question: r.question_text, explanation: r.explanation, hint: r.general_hint }; };
const refToId = new Map(rows.filter((r) => /#g003-/.test(r.source_ref || '')).map((r) => [r.source_ref.split('#g003-')[1], Number(r.id)]));

const summary = { activeDb: rows.length };

// ── (가)
const gh = G2.rows.filter((r) => r.field === 'general_hint');
const mid484 = gh.filter((r) => r47.has(r.id));
const s50set = new Set(s50);
const rest = mid484.filter((r) => !s50set.has(r.id));
const g4db = new Map(G4.rows.db.map((r) => [r.id, r]));
const restSame = rest.filter((r) => qById.get(r.id) && qById.get(r.id).general_hint === r.after);
const restChanged = rest.filter((r) => !restSame.includes(r));
summary.ga = { g002Rows: G2.rows.length, generalHint: gh.length, mid484: mid484.length, sample50: s50.length, sample50InMid: s50.filter((id) => mid484.some((r) => r.id === id)).length, rest: rest.length, restDbSame: restSame.length, restDbChanged: restChanged.map((r) => [r.id, g4db.has(r.id) ? g4db.get(r.id).version : 'not-g004']), by: cnt(restSame, (r) => r.by), notInMid: gh.filter((r) => !r47.has(r.id)).map((r) => r.id) };
const gaItems = restSame.map((r) => {
  const id = r.id, cur = qById.get(id), v6 = V6.midHints[id], t = r47.get(id);
  const chk = checkHint({ hint: r.after, answer: cur.display_answer, variants: variantsOf(id), question: cur.question_text, explanation: cur.explanation || '' });
  return {
    id, answer: cur.display_answer, variants: variantsOf(id), dif: cur.difficulty_score, path: t?.path, question: cur.question_text, explanation: cur.explanation,
    before: r.before, after: r.after, by: r.by, status: r.status, g002reason: r.reason, g002sources: r.sources,
    v006: { verdict: v6?.verdict, categories: v6?.categories, reason: v6?.reason },
    sameAnswerActive: sameOf(id).map(slim), questionWords: questionWords(cur.question_text),
    warn: { hint: chk.warn.map((w) => w.kind), block: chk.block.length },
  };
});
fs.writeFileSync(SC + '/ga.json', JSON.stringify(gaItems, null, 1));

// ── (나)
const gdb = G4.rows.db.filter((r) => r.by === 'gen');
const gg3 = G4.rows.g003.filter((r) => r.by === 'gen');
summary.na = { dbGen: gdb.length, byWhy: cnt(gdb, (r) => r.why.split(' — ')[0].split(' ')[0]), g003Gen: gg3.length, g003GenFields: cnt(gg3, (r) => r.field) };
const naItems = [];
for (const r of gdb) {
  const id = r.id, cur = qById.get(id);
  const chk = checkHint({ hint: cur.general_hint, answer: cur.display_answer, variants: variantsOf(id), question: cur.question_text, explanation: cur.explanation || '' });
  naItems.push({ key: String(id), src: 'db', field: 'general_hint', id, answer: cur.display_answer, variants: variantsOf(id), dif: cur.difficulty_score, question: cur.question_text, explanation: cur.explanation, before: r.before, after: r.after, dbNow: cur.general_hint, dbEqualsAfter: cur.general_hint === r.after, why: r.why, sources: r.sources, sameAnswerActive: sameOf(id).map(slim), questionWords: questionWords(cur.question_text), warn: { hint: chk.warn.map((w) => w.kind), block: chk.block.length } });
}
for (const r of gg3) {
  if (r.field === 'discarded') { naItems.push({ key: 'g003-' + r.ref, src: 'g003', field: 'discarded', ref: r.ref, before: r.before, after: r.after, why: r.why }); continue; }
  const id = refToId.get(r.ref); const cur = id && qById.get(id);
  if (!cur) { naItems.push({ key: 'g003-' + r.ref, src: 'g003', field: r.field, ref: r.ref, missingDb: true, after: r.after, why: r.why }); continue; }
  const chk = checkHint({ hint: cur.general_hint || '', answer: cur.display_answer, variants: variantsOf(id), question: cur.question_text, explanation: cur.explanation || '' });
  const now = r.field === 'hint' ? cur.general_hint : r.field === 'question' ? cur.question_text : cur.explanation;
  naItems.push({ key: 'g003-' + r.ref, src: 'g003', field: r.field, ref: r.ref, id, answer: cur.display_answer, variants: variantsOf(id), dif: cur.difficulty_score, question: cur.question_text, explanation: cur.explanation, hint: cur.general_hint, before: r.before, after: r.after, dbNowEqualsAfter: now === r.after, why: r.why, sources: r.sources, sameAnswerActive: sameOf(id).map(slim), questionWords: questionWords(cur.question_text), warn: { hint: chk.warn.map((w) => w.kind), block: chk.block.length } });
}
summary.na.items = naItems.length;
summary.na.dbNotEqual = naItems.filter((x) => x.dbEqualsAfter === false || x.dbNowEqualsAfter === false).map((x) => x.key);
fs.writeFileSync(SC + '/na.json', JSON.stringify(naItems, null, 1));

// ── (다) H12 후보
const doneIds = new Set([...p29.map((x) => x.id), ...p29.flatMap((x) => x.pairIds), ...G4.rows.db.filter((r) => /pair|h12/i.test(r.why)).map((r) => r.id), 2188, 3679, 1734, 3942, 1323, 3706, 1064, 509, 4013]);
// 이미 고친 쌍: V007 pair-same 로 G004 가 고친 id 와 그 짝 → 쌍 단위로 뺀다
const fixedPairs = new Set();
for (const r of G4.rows.db) { if (/pair|h12/i.test(r.why)) for (const o of sameOf(r.id)) { fixedPairs.add(r.id + '|' + o); fixedPairs.add(o + '|' + r.id); } }
for (const x of p29) for (const o of x.pairIds) if (o !== x.id) { fixedPairs.add(x.id + '|' + o); fixedPairs.add(o + '|' + x.id); }
const hangulRuns = (s) => (s || '').replace(/\s+/g, '').match(/[가-힣]+/g) || [];
const grams = (s, n = 4) => { const out = new Set(); for (const run of hangulRuns(s)) for (let i = 0; i + n <= run.length; i++) out.add(run.slice(i, i + n)); return out; };
const nums = (s) => new Set(((s || '').match(/\d[\d,.]*\d|\d/g) || []).map((x) => x.replace(/[,.]/g, '')).filter((x) => x.length >= 2));
const lat = (s) => new Set(((s || '').match(/[A-Za-z][A-Za-z'-]{2,}/g) || []).map((x) => x.toLowerCase()));
const cands = [];
let activeWithHint = 0, withSameAnswer = 0;
for (const r of rows) {
  const id = Number(r.id); const h = r.general_hint; if (!h) continue; activeWithHint++;
  const others = sameOf(id); if (!others.length) continue; withSameAnswer++;
  const hg = grams(h), hn = nums(h), hl = lat(h);
  const ansTxt = [r.display_answer, ...variantsOf(id)].join(' ');
  const ag = grams(ansTxt), al = lat(ansTxt);
  const qg = grams(r.question_text), qn = nums(r.question_text), ql = lat(r.question_text);
  for (const o of others) {
    if (fixedPairs.has(id + '|' + o)) continue;
    const orow = qById.get(o);
    const text = (orow.question_text || '') + ' ' + (orow.explanation || '');
    const og = grams(text), on = nums(text), ol = lat(text);
    const sg = [...hg].filter((g) => og.has(g) && !ag.has(g));
    const sn = [...hn].filter((g) => on.has(g));
    const sl = [...hl].filter((g) => ol.has(g) && !al.has(g));
    if (!sg.length && !sn.length && !sl.length) continue;
    // 최대 공통 구절(공백 제거) 길이
    const hs = hangulRuns(h).join(''); const ot = hangulRuns(text).join('');
    let best = 0, bestStr = '';
    for (const g of sg) { let L = 4; let pos = hs.indexOf(g); while (pos >= 0) { let e = 4; while (pos + e < hs.length) { const sub = hs.slice(pos, pos + e + 1); if (ot.includes(sub)) e++; else break; } if (e > best) { best = e; bestStr = hs.slice(pos, pos + e); } pos = hs.indexOf(g, pos + 1); } }
    const novelG = sg.filter((g) => !qg.has(g)).length; // 이 문항 질문에도 없는 겹침
    cands.push({ id, other: o, score: best * 2 + sg.length + sn.length * 3 + sl.length * 2, bestRun: best, bestStr, nGram: sg.length, nums: sn, latin: sl, notInOwnQuestion: novelG, sg: sg.slice(0, 12) });
  }
}
// 힌트(문항) 단위 묶기
const byId = new Map();
for (const x of cands) { if (!byId.has(x.id)) byId.set(x.id, { id: x.id, hits: [] }); byId.get(x.id).hits.push(x); }
const hintLevel = [...byId.values()].map((e) => ({ id: e.id, score: Math.max(...e.hits.map((h) => h.score)), hits: e.hits.sort((a, b) => b.score - a.score) })).sort((a, b) => b.score - a.score);
summary.da = { activeWithHint, withSameAnswer, fixedPairsDirected: fixedPairs.size, pairHits: cands.length, hintsWithHit: hintLevel.length, strongRun8: hintLevel.filter((h) => h.hits[0].bestRun >= 8).length, run6: hintLevel.filter((h) => h.hits[0].bestRun >= 6).length, run5: hintLevel.filter((h) => h.hits[0].bestRun >= 5).length, numOnly: hintLevel.filter((h) => h.hits[0].bestRun < 4 || !h.hits[0].bestRun).length };
fs.writeFileSync(SC + '/da-all.json', JSON.stringify(hintLevel, null, 1));
fs.writeFileSync(SC + '/qrows.json', JSON.stringify(Object.fromEntries(rows.map((r) => [Number(r.id), { answer: r.display_answer, variants: variantsOf(Number(r.id)), dif: r.difficulty_score, question: r.question_text, explanation: r.explanation, hint: r.general_hint, ver: r.general_hint_version }]))));
fs.writeFileSync(RAW + '/_work/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
