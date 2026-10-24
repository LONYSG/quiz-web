// V024 build — merged.json + 맞혀 보기 → v024-minigame.json · items-3.json 다섯 · photoyear/items.json 의 verify·status · products.json 덧붙인 행의 verify
import fs from 'node:fs';
const ROOT = 'C:/work/quiz-web';
const W = ROOT + '/data/pipeline/audit/v024-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const m = J(W + '/merged.json');
const WRITE = process.argv.includes('--write');
const GAMES = ['price', 'worldprice', 'photo', 'estimate', 'which', 'photoyear'];
const file = (g) => (g === 'photoyear' ? `${ROOT}/data/minigame/photoyear/items.json` : `${ROOT}/data/minigame/${g}/items-3.json`);
const ck = { price: ['image', 'value'], photo: ['image', 'license', 'korean', 'difficulty', 'blind-guess'], estimate: ['image', 'value'], which: ['image', 'value'], photoyear: ['image', 'date', 'license', 'title', 'blind-guess'] };
const items = {}; const images = {}; const nk = (g, f) => (f.includes('/') ? f : `assets/minigame/${g}/${f}`);
for (const g of ['price', 'photo', 'estimate', 'which', 'photoyear']) {
  for (const [id, x] of Object.entries(m[g])) {
    const checked = g === 'estimate' && !(x.images || []).length ? ['value'] : ck[g];
    items[id] = { id, game: g, verdict: x.verdict, reason: x.reason, proposal: x.proposal ?? null, checked, value: x.value ?? null, license: x.license ?? null, korean: x.korean ?? null, unique: x.unique ?? null, difficulty: x.difficulty ?? null, date: x.date ?? null, titleOk: x.titleOk ?? null, overlap: x.overlap ?? null, urls: x.urls ?? [], piece: x.piece };
    for (const i of x.images || []) { const f = i.file || i.path; if (f) images[nk(g, f)] = { game: g, id, verdict: i.verdict, note: i.note }; }
  }
}
const wrows = {};
for (const [k, x] of Object.entries(m.worldprice.rows)) wrows[k] = { key: k, verdict: x.verdict, reason: x.reason, value: x.value, proposal: x.proposal ?? null, urls: x.urls ?? [], piece: x.piece };
const wi = J(ROOT + '/data/minigame/worldprice/items-3.json').items;
const pr = J(ROOT + '/data/minigame/worldprice/products.json');
const oldRowVerdict = (pid, cc) => pr.products.find((p) => p.productId === pid).rows.find((r) => r.cc === cc);
for (const it of wi) {
  const k = `${it.productId}/${it.targetCc}`; const r = wrows[k];
  const verdict = r ? r.verdict : 'drop';
  const unv = r && (r.value?.valueStatus === 'unverified' || /unverified/.test(r.reason || ''));
  items[it.id] = { id: it.id, game: 'worldprice', verdict, reason: r ? `목표 나라 행 ${k}: ${r.reason}` : `행 없음: ${k}`, proposal: null, checked: ['value', 'fx'], rows: [k], unverifiedTarget: !!unv, urls: [] };
}
const all = Object.values(items);
const byGame = {}; for (const g of GAMES) { const a = all.filter((x) => x.game === g); byGame[g] = { n: a.length, ...cnt(a, (x) => x.verdict), fixRate: +(a.filter((x) => x.verdict === 'fix').length / a.length * 100).toFixed(1) }; }
const imgs = Object.entries(images); const imgBad = imgs.filter(([, v]) => v.verdict !== 'ok');
const unv = (x) => x.value?.valueStatus === 'unverified' || /unverified/.test(x.reason || '');
const unverified = {}; for (const g of ['price', 'photo', 'estimate', 'which', 'photoyear']) unverified[g] = all.filter((x) => x.game === g && unv(x)).length;
const wr = Object.values(wrows); const wrUnv = wr.filter((r) => r.value?.valueStatus === 'unverified' || /unverified/.test(r.reason || ''));
const dateBasis = cnt(Object.values(m.photoyear), (x) => x.date?.dateBasis);
const counts = { total: all.length, byGame, images: { total: imgs.length, expected: 627, notOk: imgBad.length, byVerdict: cnt(imgBad, ([, v]) => v.verdict) }, unverified, worldprice: { rows: wr.length, ok: wr.filter((x) => x.verdict === 'ok').length, unverifiedRows: wrUnv.length, byProduct: cnt(wr, (r) => r.key.split('/')[0]), unverifiedByProduct: cnt(wrUnv, (r) => r.key.split('/')[0]), fxCurrencies: Object.keys(m.worldprice.fx).length }, photoyearDateBasis: dateBasis };
const status = (v) => (v === 'ok' ? 'verified' : v === 'drop' ? 'rejected' : 'candidate');
const statusCount = {};
for (const g of GAMES) {
  const f = file(g); const j = J(f);
  for (const it of j.items) {
    const r = items[it.id]; if (!r) throw new Error('판정 없음 ' + it.id);
    if (WRITE) { it.verify = { round: 'V024', verdict: r.verdict, reason: r.reason, proposal: r.proposal, checked: r.checked }; it.status = status(r.verdict); }
  }
  statusCount[g] = cnt(j.items.map((it) => ({ s: status(items[it.id].verdict) })), (x) => x.s);
  if (WRITE) fs.writeFileSync(f, JSON.stringify(j, null, 1) + '\n');
}
counts.statusIfWritten = statusCount;
if (WRITE) {
  const added = J(ROOT + '/data/pipeline/audit/g018-mg-verify-targets.json').games.worldprice.addedRows;
  for (const [pid, rows] of Object.entries(added)) {
    const p = pr.products.find((x) => x.productId === pid); const set = new Set(rows.map((r) => r.cc));
    for (const r of p.rows.slice(-rows.length)) { if (!set.has(r.cc)) throw new Error('덧붙인 행 아님 ' + pid + r.cc); const w = wrows[`${pid}/${r.cc}`]; if (!w) throw new Error('행 판정 없음 ' + pid + r.cc); r.verify = { round: 'V024', verdict: w.verdict, reason: w.reason }; }
  }
  fs.writeFileSync(ROOT + '/data/minigame/worldprice/products.json', JSON.stringify(pr, null, 1) + '\n');
}
// 맞혀 보기
const pyBlind = J(W + '/photoyear-blind.json'); const phBlind = J(W + '/photo-blind.json');
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const pitems = J(ROOT + '/data/minigame/photo/items-3.json').items;
const nonp = phBlind.filter((r) => r.cat !== 'person');
counts.photoBlind = { n: phBlind.length, exact: phBlind.filter((r) => r.exact).length, person: phBlind.filter((r) => r.cat === 'person').length, personUnknown: phBlind.filter((r) => r.cat === 'person' && r.conf === 'unknown').length, nonPersonN: nonp.length, nonPersonExact: nonp.filter((r) => r.exact).length, miss: nonp.filter((r) => !r.exact).map((r) => `${r.id} ${r.answer}→${r.guess}(${r.conf})`) };
const gdiff = cnt(pitems, (x) => x.difficulty); const jdiff = cnt(Object.values(m.photo), (x) => x.difficulty);
counts.photoDifficulty = { judge: jdiff, gen: gdiff, same: pitems.filter((x) => m.photo[x.id]?.difficulty === x.difficulty).length };
const lvl = (e, k) => { const a = e * k; return a <= 3 ? 1 : a <= 10 ? 2 : 3; };
counts.photoyearBlind = { n: pyBlind.length, medianErr: med(pyBlind.map((r) => r.err)), buckets: cnt(pyBlind, (r) => (r.err <= 2 ? '0-2' : r.err <= 5 ? '3-5' : r.err <= 10 ? '6-10' : r.err <= 20 ? '11-20' : '21+')), byGenDiff: Object.fromEntries([1, 2, 3].map((d) => [d, { n: pyBlind.filter((r) => r.gen === d).length, median: med(pyBlind.filter((r) => r.gen === d).map((r) => r.err)) }])), byRegion: Object.fromEntries(['kr', 'world'].map((d) => [d, { n: pyBlind.filter((r) => r.region === d).length, median: med(pyBlind.filter((r) => r.region === d).map((r) => r.err)) }])), newLevelX1_5: cnt(pyBlind, (r) => lvl(r.err, 1.5)), newLevelX3: cnt(pyBlind, (r) => lvl(r.err, 3)), newLevelX1: cnt(pyBlind, (r) => lvl(r.err, 1)), gen: cnt(pyBlind, (r) => r.gen), sameAsGenX1_5: pyBlind.filter((r) => lvl(r.err, 1.5) === r.gen).length };
fs.writeFileSync(ROOT + '/data/pipeline/audit/v024-minigame.json', JSON.stringify({ round: 'V024', date: '2026-10-24', model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)', counts, images, items, worldprice: { rows: wrows, fxChecks: m.worldprice.fx }, photoBlind: phBlind, photoyearBlind: pyBlind.map((r) => ({ ...r, newLevelX1_5: lvl(r.err, 1.5) })) }, null, 1));
console.log(JSON.stringify(counts, null, 1));
