// V012 build — merged.json + VERIFY 결정 → v012-minigame.json · items.json 의 verify·status 채우기
import fs from 'node:fs';
const ROOT = 'C:/work/quiz-web';
const W = ROOT + '/data/pipeline/audit/v012-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const m = J(W + '/merged.json');
const pr = J(ROOT + '/data/minigame/worldprice/products.json').products;
const flipped = [
  { id: 'worldprice-0046', game: 'worldprice', from: 'ok', to: 'drop', why: '설계 판단(2026-10-17): worldprice cc "EU"(유로 지역 한 줄)는 순위 표시에는 허용 · 목표(targetCc)로는 불허 → EU 가 targetCc 인 문항 1 은 drop. 판정자는 EU 행 값만 보아 ok 였다' },
  { id: 'iphone.jpg', game: 'worldprice', from: 'wrong-target(판정자 의심 — 지식 근거)', to: 'ok(unverified)', why: '판정자 wp-iphone 은 그림이 iPhone 16 계열(렌즈 세로)이라 17 이 아닐 수 있다고 적었다. VERIFY 가 그림을 직접 보았고 이름이 iphone-17 인 원본이 가리키는 모델인지 문서로 못 닫아(기본형 17 의 카메라 배열을 문서로 열지 않음) 지식으로 fix 를 달지 않고 ok(unverified)로 둔다 → CV' },
];
const ck = { price: ['image', 'value'], photo: ['image', 'license', 'korean', 'difficulty'], estimate: ['image', 'value'], which: ['image', 'value'] };
const items = {}; const images = {};
for (const g of ['price', 'photo', 'estimate', 'which']) {
  for (const [id, x] of Object.entries(m[g])) {
    const checked = g === 'estimate' && !(x.images || []).length ? ['value'] : ck[g];
    items[id] = { id, game: g, verdict: x.verdict, reason: x.reason, proposal: x.proposal ?? null, checked, value: x.value ?? null, license: x.license ?? null, korean: x.korean ?? null, unique: x.unique ?? null, difficulty: x.difficulty ?? null, urls: x.urls ?? [], piece: x.piece };
    for (const i of x.images || []) { const f = i.file || i.path; if (f) images[f] = { game: g, id, verdict: i.verdict, note: i.note }; }
  }
}
// worldprice
const wrows = {}; for (const [k, x] of Object.entries(m.worldprice.rows)) { wrows[k] = { key: k, verdict: x.verdict, reason: x.reason, value: x.value, proposal: x.proposal ?? null, urls: x.urls ?? [], piece: x.piece }; for (const i of x.images || []) { const f = typeof i === 'string' ? null : (i.file || i.path); if (f) images[f] = { game: 'worldprice', id: k, verdict: i.verdict, note: i.note }; } }
for (const [p, i] of Object.entries(m.worldprice.images)) images[i.path || i.file] = { game: 'worldprice', id: p, verdict: i.verdict, note: i.note };
images['assets/minigame/worldprice/iphone.jpg'] = { game: 'worldprice', id: 'wp-iphone', verdict: 'ok', note: '판정자: iPhone 16 계열 디자인 의심(wrong-target) · VERIFY 직접 확인: 검은 폰 뒷면 세로 이중 렌즈 · 글자 없음 — 17 인지 문서로 못 닫아 ok(unverified) · flipped 참고' };
const wi = J(ROOT + '/data/minigame/worldprice/items.json').items;
const wpItems = {};
for (const it of wi) {
  const keys = [`${it.productId}/${it.targetCc}`, ...it.shownCc.map((c) => `${it.productId}/${c}`)];
  const rs = keys.map((k) => wrows[k]); const missing = keys.filter((k) => !wrows[k]);
  let verdict = missing.length ? 'drop' : rs.some((r) => r.verdict === 'drop') ? 'drop' : rs.some((r) => r.verdict === 'fix') ? 'fix' : 'ok';
  let reason = missing.length ? `행 없음: ${missing.join(',')}` : `나라 행 ${keys.length} 전부 ok(현지가·환율 재확인)`;
  if (it.targetCc === 'EU') { verdict = 'drop'; reason = '설계 판단: EU(유로 지역 한 줄)는 targetCc 로 불허 → drop'; }
  else if (it.shownCc.includes('EU')) reason += ' · shownCc 에 EU — R052 가 "유로 지역" 으로 표시(설계 판단 ok)';
  wpItems[it.id] = { id: it.id, game: 'worldprice', verdict, reason, proposal: null, checked: ['value', 'fx'], rows: keys, urls: [] };
  items[it.id] = wpItems[it.id];
}
const all = Object.values(items);
const byGame = {}; for (const g of ['price', 'worldprice', 'photo', 'estimate', 'which']) { const a = all.filter((x) => x.game === g); byGame[g] = { n: a.length, ...cnt(a, (x) => x.verdict), fixRate: +(a.filter((x) => x.verdict === 'fix').length / a.length * 100).toFixed(1) }; }
const imgs = Object.entries(images); const imgBad = imgs.filter(([, v]) => v.verdict !== 'ok');
const unv = (x) => x.value?.valueStatus === 'unverified' || /unverified/.test(x.reason || '');
const unverified = {}; for (const g of ['price', 'photo', 'estimate', 'which']) unverified[g] = all.filter((x) => x.game === g && unv(x)).length;
const wr = Object.values(wrows);
const web = { note: '판정자는 Read(그림)·WebFetch 만 썼다(WebSearch 는 price3 1회). 조각별 자기 보고 횟수 합 + VERIFY 직접', webFetchJudges: 41 + 29 + 45 + 32 + 6 + 40 + 67 + 67 + 67 + 68 + 45 + 39 + 35 + 53 + 44 + 60 + 49 + 26 + 60 + 57 + 71 + 77, webSearchJudges: 1, verifyWebFetch: 6, verifyWebSearch: 0, verifyImageReads: 11 + 0, limitWebSearch: 80, r429: 0 };
const counts = { total: all.length, byGame, images: { total: imgs.length, expected: 508, notOk: imgBad.length, byVerdict: cnt(imgBad, ([, v]) => v[1] === undefined ? v.verdict : v.verdict) }, unverified, worldprice: { rows: wr.length, ok: wr.filter((x) => x.verdict === 'ok').length, fxCurrencies: Object.keys(m.worldprice.fx).length, itemsDroppedEUtarget: 1 } };
const status = (v) => (v === 'ok' ? 'verified' : v === 'drop' ? 'rejected' : 'candidate');
const statusCount = {};
// items.json 쓰기 (verify · status 만)
for (const g of ['price', 'worldprice', 'photo', 'estimate', 'which']) {
  const f = `${ROOT}/data/minigame/${g}/items.json`; const j = J(f);
  for (const it of j.items) {
    const r = items[it.id]; if (!r) throw new Error('판정 없음 ' + it.id);
    it.verify = { round: 'V012', verdict: r.verdict, reason: r.reason, proposal: r.proposal, checked: r.checked };
    it.status = status(r.verdict);
  }
  statusCount[g] = cnt(j.items, (x) => x.status);
  fs.writeFileSync(f, JSON.stringify(j, null, 1) + '\n');
}
counts.status = statusCount;
fs.writeFileSync(ROOT + '/data/pipeline/audit/v012-minigame.json', JSON.stringify({ round: 'V012', date: '2026-10-17', model: 'claude-sonnet-5-5 (VERIFY · 판정자 하위 에이전트도 같은 모델)', web, counts, images, items, worldprice: { rows: wrows, fxChecks: m.worldprice.fx }, flipped }, null, 1));
console.log(JSON.stringify(counts, null, 1));
