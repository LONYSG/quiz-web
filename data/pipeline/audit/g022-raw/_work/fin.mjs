// G022 끝 집계 — merged + 친숙도(f01~f05) + 검토(r01~r20) + 재독(reread.json) + 웹(web.json) → audit/g022-rerate.json · stats.json
import fs from 'node:fs';
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const A = 'C:/work/quiz-web/data/pipeline/audit', W = A + '/g022-raw/_work/';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const M = J(W + 'merged.json').res; const TT = J(A + '/g022-raw/targets.json'); const T = TT.items; const famMap = J(W + 'fam.map.json');
const fam = {}; for (const f of ['f01', 'f02', 'f03', 'f04', 'f05']) for (const x of J(W + f + '.out.json')) { if (famMap[x.id] == null) continue; const pct = x.pct; fam[famMap[x.id]] = { level: pct >= 70 ? 3 : pct >= 30 ? 2 : 1, pct, source: 'G022 둘째 판정(정답만 · 보정 10)', why: x.why }; }
const rev = {}; for (const f of fs.readdirSync(W).filter((x) => /^r\d\d\.out\.json$/.test(x))) for (const x of J(W + f)) rev[x.id] = { ...x, piece: f.slice(0, 3) };
const RR = J(W + 'reread.json'); const WEB = J(W + 'web.json');
const OV = fs.existsSync(A + '/v028-rerate.json') ? J(A + '/v028-rerate.json').items : null;
const BAD_VAR = new Set(['유ventus']);
const items = {};
for (const [id, r] of Object.entries(M)) {
  const t = T[id]; const fs0 = t.famSource;
  const familiarity = fam[id] ?? (fs0 && !fs0.missing ? { level: fs0.level, pct: fs0.pct, source: fs0.from + (fs0.third ? ' 셋째 판정' : fs0.cross ? ' (V023 교차 ' + (fs0.cross.confirmed ? '확정' : '경계') + ')' : '') } : null);
  const variants = [...new Set((r.variants || []).map((v) => String(v).trim()).filter(Boolean))].filter((v) => !BAD_VAR.has(v)).filter((v) => { const n = normalizeAnswer(v); return n && n !== normalizeAnswer(t.answer) && !(t.variants || []).some((e) => normalizeAnswer(e) === n); });
  const rv = rev[id];
  const review = rv ? { verdict: (rv.leak || rv.factChange) && rv.verdict === 'ok' ? 'fix?' : rv.verdict, leak: !!rv.leak, factChange: !!rv.factChange, easier: rv.easier ?? rv.better ?? null, fixText: rv.fixText ?? null, ...(rv.leakNote && rv.leak ? { leakNote: rv.leakNote } : {}), ...(rv.factNote && rv.factChange ? { factNote: rv.factNote } : {}) } : null;
  const o = { v2: r.v2, why: r.why, confidence: r.conf, tags: r.tags || [], familiarity, h9: r.h9, flags: { unique: r.unique, fact: r.fact, variants, read: { grade: r.read.grade, proposal: r.read.proposal, qlenOver: !!r.read.qlenOver, glossed: !!r.read.glossed, review }, timeBound: r.timeBound, category: r.category, inputForm: r.inputForm, sensitive: r.sensitive }, cur: t.curDif, half: 'gen', overlap: t.overlap, piece: r.piece };
  if (RR[id]) o.reread = RR[id];
  if (WEB[id]) o.flags.fact = { ...(o.flags.fact || {}), web: { result: WEB[id][0], source: WEB[id][1], note: WEB[id][2] } };
  if (t.overlap && OV?.[id]) o.overlapVerify = { v2: OV[id].v2, diff: r.v2 - OV[id].v2 };
  items[id] = o;
}
const out = { meta: { builtAt: new Date().toISOString(), round: 'G022', half: 'gen', targets: Object.keys(items).length, activeAtStart: TT.activeAtStart, instructions: 'audit/v028-raw/INSTRUCTIONS.md + INSTRUCTIONS.gen-memo.md', note: 'items[id] — V027 스키마 + familiarity.source + half + overlap (+ reread 직접 재독 의견 · overlapVerify). DB 쓰기 없음. 변형 제안은 원자료(정규화 뒤 중복 제거). review.verdict "fix?" = 검토자가 leak/factChange 를 true 로 두고 ok 라 함(r01 · 지시 보강 전) — 적용 전 사람 확인', webChecked: Object.fromEntries(Object.entries(WEB).map(([k, v]) => [k, { result: v[0], source: v[1], note: v[2] }])) }, items };
fs.writeFileSync(A + '/g022-rerate.json', JSON.stringify(out));
// 집계
const ids = Object.keys(items); const I = (i) => items[i]; const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const S = { n: ids.length, v2: cnt(ids, (i) => I(i).v2), cur: cnt(ids, (i) => I(i).cur), conf: cnt(ids, (i) => I(i).confidence) };
S.moves = {}; for (const c of [1, 2, 3, 4, 5]) S.moves[c] = cnt(ids.filter((i) => I(i).cur === c), (i) => I(i).v2);
S.up = ids.filter((i) => I(i).v2 > I(i).cur).length; S.down = ids.filter((i) => I(i).v2 < I(i).cur).length;
S.tags = {}; for (const i of ids) for (const t of I(i).tags) S.tags[t] = (S.tags[t] || 0) + 1;
const famIds = ids.filter((i) => I(i).familiarity?.source?.startsWith('G022'));
S.famG022 = { n: famIds.length, lv: cnt(famIds, (i) => I(i).familiarity.level), border20to29: famIds.filter((i) => I(i).familiarity.level === 1 && I(i).familiarity.pct >= 20).length, near30to39: famIds.filter((i) => I(i).familiarity.pct >= 30 && I(i).familiarity.pct < 40).length };
S.fam1v2 = cnt(famIds.filter((i) => I(i).familiarity.level === 1), (i) => I(i).v2);
S.famSource = cnt(ids, (i) => I(i).familiarity ? I(i).familiarity.source.split(' ')[0] : '없음');
S.h9 = ids.filter((i) => I(i).h9?.fix).length; S.h9none = ids.filter((i) => I(i).h9?.none).length;
S.unique = ids.filter((i) => I(i).flags.unique?.flag).length; S.fact = ids.filter((i) => I(i).flags.fact?.flag).length;
S.variantsItems = ids.filter((i) => I(i).flags.variants.length).length; S.variantsTotal = ids.reduce((s, i) => s + I(i).flags.variants.length, 0); S.inputForm = ids.filter((i) => I(i).flags.inputForm?.flag).length;
S.read = cnt(ids, (i) => I(i).flags.read.grade); S.readByV2 = {}; for (const g of [1, 2, 3, 4, 5]) S.readByV2[g] = cnt(ids.filter((i) => I(i).v2 === g), (i) => I(i).flags.read.grade);
S.glossed = ids.filter((i) => I(i).flags.read.glossed).length; S.qlenOver = ids.filter((i) => I(i).flags.read.qlenOver).length;
const rv = ids.filter((i) => I(i).flags.read.review); S.review = { n: rv.length, verdict: cnt(rv, (i) => I(i).flags.read.review.verdict), leak: rv.filter((i) => I(i).flags.read.review.leak).length, factChange: rv.filter((i) => I(i).flags.read.review.factChange).length, easier: cnt(rv, (i) => I(i).flags.read.review.easier) };
S.timeBound = ids.filter((i) => I(i).flags.timeBound).length; S.catBad = ids.filter((i) => I(i).flags.category?.ok === false).length; S.catEmpty = ids.filter((i) => !T[i].category).length; S.sensitive = ids.filter((i) => I(i).flags.sensitive?.flag).length;
S.byMajor = {}; for (const i of ids) { const k = (T[i].category || '(없음)').split(' > ')[0]; (S.byMajor[k] ||= { n: 0, v2sum: 0, cursum: 0 }); S.byMajor[k].n++; S.byMajor[k].v2sum += I(i).v2; S.byMajor[k].cursum += I(i).cur; }
for (const k of Object.keys(S.byMajor)) { const b = S.byMajor[k]; b.v2 = +(b.v2sum / b.n).toFixed(2); b.cur = +(b.cursum / b.n).toFixed(2); delete b.v2sum; delete b.cursum; }
S.noHint3 = ids.filter((i) => I(i).v2 >= 3 && !T[i].hint).length; S.noHint3fromLow = ids.filter((i) => I(i).v2 >= 3 && I(i).cur <= 2 && !T[i].hint).length; S.noHintAny = ids.filter((i) => !T[i].hint).length;
const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase(); const byA = {}; for (const i of ids) (byA[norm(T[i].answer)] ||= []).push(i); S.sameAnswer = Object.values(byA).filter((v) => v.length > 1).map((v) => ({ answer: T[v[0]].answer, ids: v.map(Number), v2: v.map((i) => I(i).v2) }));
S.over200 = ids.filter((i) => [...T[i].question].length > 200).length;
S.reread = Object.keys(RR).filter((k) => !k.startsWith('_')).length;
if (OV) { const ov = ids.filter((i) => I(i).overlapVerify); const d = ov.map((i) => I(i).overlapVerify.diff); S.overlap = { n: ov.length, exact: d.filter((x) => x === 0).length, pm1: d.filter((x) => Math.abs(x) <= 1).length, ge2: ov.filter((i) => Math.abs(I(i).overlapVerify.diff) >= 2).map(Number), bias: +(d.reduce((a, b) => a + b, 0) / (d.length || 1)).toFixed(3) }; } else S.overlap = null;
fs.writeFileSync(W + 'stats.json', JSON.stringify(S, null, 1));
console.log(JSON.stringify({ ...S, sameAnswer: S.sameAnswer.length, byMajor: undefined }, null, 0));
console.log('MB', (fs.statSync(A + '/g022-rerate.json').size / 1e6).toFixed(2));
