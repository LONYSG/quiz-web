// V017 build — merged.json + 맞혀 보기 + VERIFY 결정 → v017-minigame.json · items-2.json 의 verify·status · products.json 새 품목 rows 의 verify
import fs from 'node:fs';
const ROOT = 'C:/work/quiz-web';
const W = ROOT + '/data/pipeline/audit/v017-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const m = J(W + '/merged.json');
const flipped = [];
const flipTo = (g, id, to, why) => { const x = m[g][id]; if (x && x.verdict === 'ok') { flipped.push({ id, game: g, from: 'ok', to, why }); x.verdict = to; x.flip = why; } };
flipTo('photo', 'photo-0207', 'fix', '정답 모르는 판정자가 사진만 보고 "다식"을 confident 로 답함(정답 약과) — 사진만으로 하나가 아님(multi-answer). altAnswers 로 받을 수 없는 별개 음식이라 그림 교체 또는 질문 단서 필요 — G 가 정함');
flipTo('photo', 'photo-0141', 'fix', '정답 모르는 판정자가 "다식판"(maybe)으로 답함(정답 떡살) — 비슷한 도구가 둘 이상 떠오름(multi-answer). 그림 교체 또는 altAnswers 불가 여부 확인');
const guess = J(W + '/guess.out.json');
const pr = J(ROOT + '/data/minigame/worldprice/products.json');
const ck = { price: ['image', 'value'], photo: ['image', 'license', 'korean', 'difficulty', 'blind-guess'], estimate: ['image', 'value'], which: ['image', 'value'] };
const items = {}; const images = {}; const nk = (g, f) => (f.includes('/') ? f : `assets/minigame/${g}/${f}`);
for (const g of ['price', 'photo', 'estimate', 'which']) {
  for (const [id, x] of Object.entries(m[g])) {
    const checked = g === 'estimate' && !(x.images || []).length ? ['value'] : ck[g];
    items[id] = { id, game: g, verdict: x.verdict, reason: x.flip ? `${x.reason} ⇒ VERIFY 뒤집음: ${x.flip}` : x.reason, proposal: x.proposal ?? null, checked, value: x.value ?? null, license: x.license ?? null, korean: x.korean ?? null, unique: x.unique ?? null, difficulty: x.difficulty ?? null, urls: x.urls ?? [], piece: x.piece };
    for (const i of x.images || []) { const f = i.file || i.path; if (f) images[nk(g, f)] = { game: g, id, verdict: i.verdict, note: i.note }; }
  }
}
const wrows = {};
for (const [k, x] of Object.entries(m.worldprice.rows)) { wrows[k] = { key: k, verdict: x.verdict, reason: x.reason, value: x.value, proposal: x.proposal ?? null, urls: x.urls ?? [], piece: x.piece }; for (const i of x.images || []) { const f = typeof i === 'string' ? null : (i.file || i.path); if (f) images[f] = { game: 'worldprice', id: k, verdict: i.verdict, note: i.note }; } }
for (const [p, i] of Object.entries(m.worldprice.images)) images[i.path || i.file] = { game: 'worldprice', id: p, verdict: i.verdict, note: i.note };
if (!images['assets/minigame/worldprice/gasoline.jpg']) images['assets/minigame/worldprice/gasoline.jpg'] = { game: 'worldprice', id: 'wp-gasoline', verdict: 'ok', note: '판정자: 주유 노즐을 파란 차 주유구에 꽂은 사진 · 정답 글자·가격 숫자 없음(작은 "REMOVE BY 10/2016"·"CAUTION" 라벨만) — 판정자가 images 를 경로 문자열로 적어 merge 가 못 읽어 VERIFY 가 보고서에서 옮김' };
const wi = J(ROOT + '/data/minigame/worldprice/items-2.json').items;
for (const it of wi) {
  const keys = [`${it.productId}/${it.targetCc}`, ...it.shownCc.map((c) => `${it.productId}/${c}`)];
  const rs = keys.map((k) => wrows[k]); const missing = keys.filter((k) => !wrows[k]);
  const verdict = missing.length ? 'drop' : rs.some((r) => r.verdict === 'drop') ? 'drop' : rs.some((r) => r.verdict === 'fix') ? 'fix' : 'ok';
  const unv = rs.filter((r) => r && (r.value?.valueStatus === 'unverified' || /unverified/.test(r.reason || ''))).length;
  const reason = missing.length ? `행 없음: ${missing.join(',')}` : `나라 행 ${keys.length} 중 확인 ${keys.length - unv} · unverified ${unv} (틀린 증거 없음) · 환율 ±3% 통과`;
  items[it.id] = { id: it.id, game: 'worldprice', verdict, reason, proposal: null, checked: ['value', 'fx'], rows: keys, urls: [] };
}
const all = Object.values(items);
const byGame = {}; for (const g of ['price', 'worldprice', 'photo', 'estimate', 'which']) { const a = all.filter((x) => x.game === g); byGame[g] = { n: a.length, ...cnt(a, (x) => x.verdict), fixRate: +(a.filter((x) => x.verdict === 'fix').length / a.length * 100).toFixed(1) }; }
const imgs = Object.entries(images); const imgBad = imgs.filter(([, v]) => v.verdict !== 'ok');
const unv = (x) => x.value?.valueStatus === 'unverified' || /unverified/.test(x.reason || '');
const unverified = {}; for (const g of ['price', 'photo', 'estimate', 'which']) unverified[g] = all.filter((x) => x.game === g && unv(x)).length;
const wr = Object.values(wrows); const wrUnv = wr.filter((r) => r.value?.valueStatus === 'unverified' || /unverified/.test(r.reason || ''));
const counts = { total: all.length, byGame, images: { total: imgs.length, expected: 503, notOk: imgBad.length, byVerdict: cnt(imgBad, ([, v]) => v.verdict) }, unverified, worldprice: { rows: wr.length, ok: wr.filter((x) => x.verdict === 'ok').length, unverifiedRows: wrUnv.length, byProduct: cnt(wr, (r) => r.key.split('/')[0]), unverifiedByProduct: cnt(wrUnv, (r) => r.key.split('/')[0]), fxCurrencies: Object.keys(m.worldprice.fx).length } };
const status = (v) => (v === 'ok' ? 'verified' : v === 'drop' ? 'rejected' : 'candidate');
const statusCount = {};
for (const g of ['price', 'worldprice', 'photo', 'estimate', 'which']) {
  const f = `${ROOT}/data/minigame/${g}/items-2.json`; const j = J(f);
  for (const it of j.items) {
    const r = items[it.id]; if (!r) throw new Error('판정 없음 ' + it.id);
    it.verify = { round: 'V017', verdict: r.verdict, reason: r.reason, proposal: r.proposal, checked: r.checked };
    it.status = status(r.verdict);
  }
  statusCount[g] = cnt(j.items, (x) => x.status);
  fs.writeFileSync(f, JSON.stringify(j, null, 1) + '\n');
}
counts.status = statusCount;
// products.json — 새 품목 2 의 rows 에만 verify
for (const p of pr.products) {
  if (!['gasoline', 'cocacola'].includes(p.productId)) continue;
  for (const r of p.rows) { const w = wrows[`${p.productId}/${r.cc}`]; if (!w) throw new Error('행 판정 없음 ' + p.productId + r.cc); r.verify = { round: 'V017', verdict: w.verdict, reason: w.reason }; }
}
fs.writeFileSync(ROOT + '/data/minigame/worldprice/products.json', JSON.stringify(pr, null, 1) + '\n');
// 맞혀 보기 집계
const pitems = J(ROOT + '/data/minigame/photo/items-2.json').items; const pby = Object.fromEntries(pitems.map((x) => [x.id, x]));
const norm = (s) => String(s).replace(/[\s·\-_()]/g, '').toLowerCase();
const blind = guess.map((g) => { const t = pby[g.id]; const set = [t.answer, ...(t.altAnswers || [])].map(norm); return { id: g.id, answer: t.answer, guess: g.guess, confidence: g.confidence, alternatives: g.alternatives || [], exact: set.includes(norm(g.guess)) }; });
counts.blindGuess = { n: blind.length, exact: blind.filter((b) => b.exact).length, miss: blind.filter((b) => !b.exact).map((b) => `${b.id} ${b.answer}→${b.guess}`), confidence: cnt(blind, (b) => b.confidence) };
const diffNew = cnt(Object.values(m.photo), (x) => x.difficulty); const diffGen = cnt(pitems, (x) => x.difficulty);
counts.photoDifficulty = { judge: diffNew, gen: diffGen, same: pitems.filter((x) => m.photo[x.id]?.difficulty === x.difficulty).length };
const web = { note: '판정자는 Read(그림)·WebFetch 만 썼다(WebSearch 는 estimate4 3 · gasoline 1). 조각별 자기 보고 횟수 합', webFetchJudges: 28 + 25 + 34 + 39 + 33 + 35 + 37 + 33 + 42 + 42 + 43 + 52 + 43 + 66 + 56 + 73 + 65 + 46 + 58 + 45 + 20, webSearchJudges: 4, verifyWebFetch: 0, verifyWebSearch: 0, limitWebSearch: 80, r429: 'usage 1 (wp-gasoline 3차 직후) · 사이트 요청 제한 429(GlobalPetrolPrices · Numbeo)' };
fs.writeFileSync(ROOT + '/data/pipeline/audit/v017-minigame.json', JSON.stringify({ round: 'V017', date: '2026-10-19', model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)', web, counts, images, items, worldprice: { rows: wrows, fxChecks: m.worldprice.fx }, blindGuess: blind, flipped }, null, 1));
console.log(JSON.stringify(counts, null, 1));
