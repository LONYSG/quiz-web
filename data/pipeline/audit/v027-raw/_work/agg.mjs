import fs from 'node:fs';
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const A = 'C:/work/quiz-web/data/pipeline/audit', W = A + '/v027-raw/_work/';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const M = J(W + 'merged.json').res; const T = J(A + '/v027-targets.json').items; const famMap = J(W + 'fam.map.json');
const fam = {}; for (const f of ['f01','f02','f03','f04','f05','f06']) for (const x of J(W + f + '.out.json')) { const pct = x.pct; const level = pct >= 70 ? 3 : pct >= 30 ? 2 : 1; if (famMap[x.id] != null) fam[famMap[x.id]] = { familiarity: level, pct, why: x.why }; }
const band = (ms) => ms == null ? 'none' : ms < 10000 ? 'pre' : ms < 25000 ? 'hint1' : 'chosung';
const items = {};
for (const [id, r] of Object.entries(M)) { const t = T[id]; const s = t.human.ser; const trim = (a) => [...new Set((a || []).map((v) => String(v).trim()).filter(Boolean))];
  items[id] = { v2: r.v2, why: r.why, confidence: r.conf, tags: r.tags || [], familiarity: fam[id] || null, h9: r.h9, flags: { unique: r.unique, fact: r.fact, variants: trim(r.variants).filter((v) => { const n = normalizeAnswer(v); return n !== normalizeAnswer(t.answer) && !(t.variants || []).some((e) => normalizeAnswer(e) === n); }), read: r.read, timeBound: r.timeBound, category: r.category, inputForm: r.inputForm, sensitive: r.sensitive }, cur: t.curDif, human: { n: s.n, solved: s.solved, fastestMs: s.fastestMs, band: band(s.fastestMs), rooms: s.rooms, all: { n: t.human.n, solved: t.human.solved, fastestMs: t.human.fastestMs }, yuja: t.human.yuja }, piece: r.piece }; }
fs.writeFileSync(W + 'items.v027.json', JSON.stringify(items));
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const ids = Object.keys(items); const I = (id) => items[id];
const S = {};
S.n = ids.length; S.v2 = cnt(ids, (i) => I(i).v2); S.cur = cnt(ids, (i) => I(i).cur);
S.fam = cnt(ids, (i) => I(i).familiarity?.familiarity); S.famNear1 = ids.filter((i) => I(i).familiarity && I(i).familiarity.pct >= 30 && I(i).familiarity.pct <= 40).length; S.famBorder = ids.filter((i) => I(i).familiarity?.familiarity === 1 && I(i).familiarity.pct >= 20).length;
S.h9 = ids.filter((i) => I(i).h9?.fix).length; S.h9none = ids.filter((i) => I(i).h9?.none).length;
S.unique = ids.filter((i) => I(i).flags.unique?.flag).length; S.fact = ids.filter((i) => I(i).flags.fact?.flag).length;
S.variantsItems = ids.filter((i) => I(i).flags.variants.length).length; S.variantsTotal = ids.reduce((s, i) => s + I(i).flags.variants.length, 0);
S.readByV2 = {}; for (const g of [1,2,3,4,5]) S.readByV2[g] = cnt(ids.filter((i) => I(i).v2 === g), (i) => I(i).flags.read.grade);
S.read = cnt(ids, (i) => I(i).flags.read.grade); S.readGlossed = ids.filter((i) => I(i).flags.read.glossed).length; S.qlenOver = ids.filter((i) => I(i).flags.read.qlenOver).length;
S.timeBound = ids.filter((i) => I(i).flags.timeBound).length; S.catBad = ids.filter((i) => I(i).flags.category?.ok === false).length; S.inputForm = ids.filter((i) => I(i).flags.inputForm?.flag).length; S.sensitive = ids.filter((i) => I(i).flags.sensitive?.flag).length;
S.conf = cnt(ids, (i) => I(i).confidence);
// 기계
S.noHint3 = ids.filter((i) => I(i).v2 >= 3 && !T[i].hint).length; S.noHintAny = ids.filter((i) => !T[i].hint).length; S.noHint2to3 = ids.filter((i) => T[i].curDif <= 2 && I(i).v2 >= 3 && !T[i].hint).length;
const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase(); const byA = {}; for (const i of ids) (byA[norm(T[i].answer)] ||= []).push(i); S.sameAnswerGroups = Object.entries(byA).filter(([, v]) => v.length > 1).map(([k, v]) => ({ answer: T[v[0]].answer, ids: v }));
S.over200 = ids.filter((i) => T[i].question.length > 200).length; S.over240 = ids.filter((i) => T[i].question.length > 240).length;
S.lowPool = { now12: ids.filter((i) => I(i).cur <= 2).length, v2_12: ids.filter((i) => I(i).v2 <= 2).length };
S.moves = {}; for (const c of [1,2,3,4]) S.moves[c] = cnt(ids.filter((i) => I(i).cur === c), (i) => I(i).v2);
S.up = ids.filter((i) => I(i).v2 > I(i).cur).length; S.down = ids.filter((i) => I(i).v2 < I(i).cur).length;
fs.writeFileSync(W + 'stats.json', JSON.stringify(S, null, 1));
console.log(JSON.stringify(S, null, 1).slice(0, 4500));
