// V010 build — 판정자 출력 + r2 + VERIFY 재독 결정(ov.json) → data/pipeline/audit/v010-results.json
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v10';
const R = 'C:/work/quiz-web/data/pipeline/audit/v010-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const pct = (a, b) => (b ? +(a / b * 100).toFixed(1) : null);
const t = J(SC + '/targets.json'); const tById = Object.fromEntries(t.map((x) => [x.id, x]));
const ov = J(R + '/_work/ov.json'); const rr = J(R + '/_work/reread-ids.json'); const summary = J(R + '/_work/summary.json');
const judge = {}; for (let i = 1; i <= 8; i++) for (const x of J(`${R}/p${i}.out.json`)) judge[x.id] = { ...x, piece: 'p' + i };
const r2 = Object.fromEntries(J(R + '/r2.out.json').map((x) => [x.id, x]));
const items = {}; const flipped = [];
for (const id of Object.keys(judge).map(Number)) {
  const j = judge[id], x = tById[id], o = ov[id];
  let dif = j.dif; if (o) { flipped.push({ id, answer: x.answer, judge: j.dif, rater2: r2[id]?.dif ?? null, final: o.dif, why: o.why }); dif = o.dif; }
  items[id] = { id, answer: x.answer, topic: x.topic, c1: x.c1name, c2: x.c2name, c3key: x.c3key, c3: x.c3name, round: x.round, current: { dif: x.dif, scoreVersion: x.scoreVersion, source: x.source }, dif, judgeDif: j.dif, rater2Dif: r2[id]?.dif ?? null, easiestCue: j.easiestCue, difWhy: j.difWhy, edge: j.edge ?? null, note: j.note ?? null, piece: j.piece, verifyDecided: !!o, rater2Cue: r2[id]?.easiestCue ?? null };
}
const all = Object.values(items);
const mat = cnt(all, (x) => `${x.current.dif}→${x.dif}`);
const keep = (a) => ({ n: a.length, keep: a.filter((x) => x.dif >= 4).length, pct: pct(a.filter((x) => x.dif >= 4).length, a.length), curTop: a.length });
const group = (f) => { const m = {}; for (const x of all) { const k = f(x); (m[k] ||= []).push(x); } return Object.fromEntries(Object.entries(m).map(([k, a]) => [k, keep(a)])); };
const byTopic = group((x) => x.topic), byRound = group((x) => x.round.startsWith('legacy') ? 'legacy' : x.round), byLegacyDate = group((x) => x.round), bySub = group((x) => x.c3key + ' ' + x.c3), byC2 = group((x) => x.c2 || '-');
const subs = Object.entries(bySub).filter(([, v]) => v.n >= 4).sort((a, b) => b[1].pct - a[1].pct || b[1].n - a[1].n);
const topSubs = subs.slice(0, 5), lowSubs = subs.slice(-5).reverse();
const kept = all.filter((x) => x.dif >= 4).length;
const g005TopV009 = 174; // V009 blind 상(drop 뺀) — G005 적재분 추정
const pool = { activeTop: 718, g003Top: 110, targetKept: kept, g005Blind: g005TopV009, withoutG005: 110 + kept, withG005: 110 + kept + g005TopV009, playsWithoutG005: Math.floor((110 + kept) / 50), playsWithG005: Math.floor((110 + kept + g005TopV009) / 50), before: { top: 718, plays: Math.floor(718 / 50), withG005V009: Math.floor((718 + g005TopV009) / 50) } };
const perPiece = Object.fromEntries(Object.keys(Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => ['p' + i, 1]))).map((k) => { const a = all.filter((x) => x.piece === k); const jt = a.filter((x) => x.judgeDif >= 4).length; return [k, { n: a.length, judgeTop: jt, judgePct: pct(jt, a.length), edge: a.filter((x) => x.edge).length, finalTop: a.filter((x) => x.dif >= 4).length }]; }));
// ── r2
const rows = Object.values(r2).map((x) => ({ id: x.id, a: judge[x.id].dif, b: x.dif, f: items[x.id].dif, piece: judge[x.id].piece }));
const topAgree = rows.filter((r) => (r.a >= 4) === (r.b >= 4)).length;
const rater2 = { n: rows.length, exact: rows.filter((r) => r.a === r.b).length, within1: rows.filter((r) => Math.abs(r.a - r.b) <= 1).length, topAgree, judgeTop: rows.filter((r) => r.a >= 4).length, rater2Top: rows.filter((r) => r.b >= 4).length, finalTop: rows.filter((r) => r.f >= 4).length, meanJudge: +(rows.reduce((s, r) => s + r.a, 0) / rows.length).toFixed(2), meanRater2: +(rows.reduce((s, r) => s + r.b, 0) / rows.length).toFixed(2), kappaLike: null,
  judgeUpRater2Down: rows.filter((r) => r.a >= 4 && r.b < 4).length, judgeDownRater2Up: rows.filter((r) => r.a < 4 && r.b >= 4).length, split: rr.split, splitDecided: flipped.filter((f) => rr.split.includes(f.id)).length,
  byPiece: Object.fromEntries(Object.keys(perPiece).map((k) => { const a = rows.filter((r) => r.piece === k); return [k, { n: a.length, judgeTop: a.filter((r) => r.a >= 4).length, rater2Top: a.filter((r) => r.b >= 4).length }]; })),
  // 2차 채점자 일치는 판정자의 상 비율이 아니라 같은 120건에서 본 값
  edgeRate: pct(Object.values(r2).filter((x) => x.edge).length, rows.length) };
const pe = topAgree / rows.length, pj = rater2.judgeTop / rows.length, pr = rater2.rater2Top / rows.length; const pc = pj * pr + (1 - pj) * (1 - pr); rater2.kappaLike = +((pe - pc) / (1 - pc)).toFixed(2);
// ── 재독
const reread = { down: rr.down, up: 0, down20: rr.down20.length, split: rr.split.length, read: rr.list.length, changedFromDown20: flipped.filter((f) => rr.down20.includes(f.id) && !rr.split.includes(f.id)).length, changedFromSplit: flipped.filter((f) => rr.split.includes(f.id)).length, changedTotal: flipped.length, directions: { jTo3: flipped.filter((f) => f.final < 4 && f.judge >= 4).length, jTo4: flipped.filter((f) => f.final >= 4 && f.judge < 4).length } };
// ── (나) 14
const h = J(R + '/h1.out.json'); const hint14 = J(SC + '/hint14.json');
const hOv = { 3990: { verdict: 'ok', categories: [], reason: 'VERIFY 재독 뒤집기(fix→ok): 판정자는 \'#2012 힌트와 같은 문장이 그대로\' 라 보았으나, g006-fixes 의 before 칸이 after 와 같게 적혀 있어 오독했다 — 현재 DB 의 #2012 힌트는 \'위대한 자 로렌초 · 갈릴레이는 목성의 위성에 이 집안 이름\' 이고 #3990 힌트(루벤스 24점 연작 · 앙리 4세 왕비)와 다른 사실이다(둘 다 DB 에서 직접 읽음)', proposal: null } };
const g006Gen = {}; for (const x of h) { const hi = hint14.find((y) => y.id === x.id); const o = hOv[x.id];
  g006Gen[x.id] = { id: x.id, answer: hi.answer, current: hi.after, before: hi.before, judgeVerdict: x.verdict, verdict: o ? o.verdict : x.verdict, categories: o ? o.categories : x.categories || [], reason: o ? o.reason : x.reason, afterVsBefore: x.afterVsBefore, alone: x.alone, proposal: { hint: o ? null : x.proposal?.hint ?? null }, facts: (x.facts || []).map((f) => ({ claim: f.claim, result: f.result, basis: f.basis, source: f.source || null })), note: x.note ?? null, verifyOverride: !!o }; }
const hFlips = Object.values(g006Gen).filter((g) => g.verifyOverride).map((g) => ({ id: g.id, from: g.judgeVerdict, to: g.verdict }));
const web = J(R + '/_work/web.json');
const result = {
  round: 'V010', date: '2026-10-17', model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)', web,
  counts: { activeDb: summary.activeDb, activeTop: summary.activeTop, g003Top: summary.g003Top, g005InDb: summary.g005InDb, targets: summary.targets, current: summary.difDist, scoreVersion: summary.scoreVersion, round: summary.round, topic: summary.topic, subs: summary.subs, g006Gen: summary.g006Gen.n },
  stats: { dist: { current: cnt(all, (x) => x.current.dif), judge: cnt(all, (x) => x.judgeDif), final: cnt(all, (x) => x.dif) }, matrix: mat, keptTop: kept, keepPct: pct(kept, 608), down: all.filter((x) => x.dif < x.current.dif).length, up: all.filter((x) => x.dif > x.current.dif).length, same: all.filter((x) => x.dif === x.current.dif).length,
    byTopic, byRound, byLegacyDate, byC2, topSubs, lowSubs, subsAll: bySub, perPiece, edge: { judge: all.filter((x) => x.edge).length, edge4OnDif3: all.filter((x) => x.judgeDif === 3 && x.edge >= 4).length, edge3OnDif4: all.filter((x) => x.judgeDif === 4 && x.edge === 3).length, edge2: all.filter((x) => x.edge === 2).length }, notes: all.filter((x) => x.note).length, pool, g006: { ok: Object.values(g006Gen).filter((g) => g.verdict === 'ok').length, fix: Object.values(g006Gen).filter((g) => g.verdict === 'fix').length, judgeFix: Object.values(g006Gen).filter((g) => g.judgeVerdict === 'fix').length, afterVsBefore: cnt(Object.values(g006Gen), (g) => String(g.afterVsBefore).split(/[ —]/)[0]) } },
  targets: J(R + '/targets-ids.json'), items, rater2, rater2Rows: rows, reread, g006Gen, flipped, hintFlips: hFlips,
};
fs.writeFileSync(A + '/v010-results.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify({ dist: result.stats.dist, matrix: mat, kept, down: result.stats.down, up: result.stats.up, byTopic, byRound, pool, perPiece, rater2: { ...rater2, byPiece: undefined, split: undefined }, reread, topSubs, lowSubs, edge: result.stats.edge, g006: result.stats.g006, byC2: Object.entries(byC2).length }, null, 1));
