// V012 setup — 대상 고정(읽기만) · 원칙 7 · 판정자 입력 조각
import fs from 'node:fs';
const ROOT = 'C:/work/quiz-web';
const RAW = ROOT + '/data/pipeline/audit/v012-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const games = {}; for (const g of ['price', 'worldprice', 'photo', 'estimate', 'which']) games[g] = J(`${ROOT}/data/minigame/${g}/items.json`).items;
const prods = J(ROOT + '/data/minigame/worldprice/products.json').products;
const sum = { counts: Object.fromEntries(Object.entries(games).map(([g, a]) => [g, a.length])), total: Object.values(games).reduce((n, a) => n + a.length, 0), allCandidate: Object.values(games).every((a) => a.every((x) => x.status === 'candidate')), allVerifyNull: Object.values(games).every((a) => a.every((x) => x.verify === null)), images: {}, missing: [], wpRows: Object.fromEntries(prods.map((p) => [p.productId, p.rows.length])) };
const imgOf = (it) => { const o = []; if (it.image) o.push(it.image.file); if (it.a?.image) o.push(it.a.image.file); if (it.b?.image) o.push(it.b.image.file); return o; };
for (const g of Object.keys(games)) { let n = 0; for (const it of games[g]) for (const f of imgOf(it)) { n++; if (!fs.existsSync(`${ROOT}/${f}`)) sum.missing.push(f); } sum.images[g] = n; }
for (const p of prods) if (p.image) { sum.images.worldprice = (sum.images.worldprice || 0); }
sum.imagesTotal = Object.values(sum.images).reduce((a, b) => a + b, 0);
sum.wpProductImages = prods.map((p) => p.image?.file);
fs.writeFileSync(RAW + '/_work/summary.json', JSON.stringify(sum, null, 1));
fs.writeFileSync(RAW + '/targets-ids.json', JSON.stringify({ frozenAt: new Date().toISOString(), ...Object.fromEntries(Object.entries(games).map(([g, a]) => [g, a.map((x) => x.id)])) }));

const img = (i) => i ? `그림: ${i.file} | ${i.license} | ${one(i.attribution)} | 원본 ${i.sourceUrl}` : '그림: 없음';
const src = (s) => (s || []).map((x) => `<${x.url}> «${one(x.note).slice(0, 220)}»`).join(' ; ');
const fmt = {
  price: (x) => [`### ${x.id}  ${x.name} (${x.brand}) · ${x.category} · 기록 가격 ${x.priceKrw}원 [${x.priceKind}] · asOf ${x.priceAsOf} · bucket ${x.bucket}`, img(x.image), '기록한 판매처: ' + x.priceSources.map((s) => `${s.seller} ${s.priceKrw}원 <${s.url}>`).join(' ; '), 'note: ' + one(x.note), 'sources: ' + src(x.sources), ''].join('\n'),
  photo: (x) => [`### ${x.id}  정답 «${x.answer}» 변형 ${JSON.stringify(x.altAnswers)} · ${x.category} · reveal ${x.revealMode} · GEN 난이도 ${x.difficulty}`, img(x.image), '해설: ' + one(x.explanation), 'sources: ' + src(x.sources), ''].join('\n'),
  estimate: (x) => [`### ${x.id}  [${x.kind}] ${x.question}  → 값 ${x.value} ${x.unit} (asOf ${x.asOf ?? '-'})`, img(x.image), '해설: ' + one(x.explanation), 'note: ' + one(x.note), 'sources: ' + src(x.sources), ''].join('\n'),
  which: (x) => [`### ${x.id}  [${x.kind}] ${x.stem} | A ${x.a.label}=${x.a.value} | B ${x.b.label}=${x.b.value} | 정답 ${x.answer} · ${x.unit} · margin ${x.margin} · asOf ${x.asOf}`, '그림 A: ' + (x.a.image ? `${x.a.image.file} | ${x.a.image.license} | ${one(x.a.image.attribution)} | ${x.a.image.sourceUrl}` : '없음'), '그림 B: ' + (x.b.image ? `${x.b.image.file} | ${x.b.image.license} | ${one(x.b.image.attribution)} | ${x.b.image.sourceUrl}` : '없음'), 'sources: ' + src(x.sources), ''].join('\n'),
};
const pieces = [];
const chunk = (g, size, name) => { const a = games[g]; for (let i = 0, k = 1; i < a.length; i += size, k++) pieces.push({ name: `${name}${k}`, game: g, items: a.slice(i, i + size) }); };
chunk('price', 25, 'price'); chunk('photo', 30, 'photo'); chunk('estimate', 25, 'estimate'); chunk('which', 30, 'which');
// worldprice: 품목 rows (나라) 단위
const wpPieces = [];
for (const p of prods) {
  const rows = p.rows; const size = p.productId === 'netflix' ? 65 : rows.length; for (let i = 0, k = 1; i < rows.length; i += size, k++) wpPieces.push({ name: `wp-${p.productId}${p.productId === 'netflix' ? k : ''}`, game: 'worldprice', product: p, rows: rows.slice(i, i + size) });
}
const hdr = (t) => `## ${t}\n\n`;
const files = {};
for (const pc of pieces) {
  fs.writeFileSync(`${RAW}/_work/${pc.name}.txt`, hdr(`${pc.game} 조각 ${pc.name} (${pc.items.length}건)`) + pc.items.map(fmt[pc.game]).join('\n'));
  fs.writeFileSync(`${RAW}/_work/${pc.name}.refs.json`, JSON.stringify(pc.items.map((x) => x.id)));
  files[pc.name] = pc.items.length;
}
// worldprice: 문항(targetCc/shownCc) 기준으로 나라 행을 한 번씩 — 나라 행 단위 판정
const wi = games.worldprice; const used = {};
for (const pc of wpPieces) {
  const p = pc.product; const L = [hdr(`worldprice ${p.productId} (${pc.rows.length}개 나라 행) — 단위 ${p.unit} · asOf ${p.asOf} · fxAsOf ${p.fxAsOf}`), 'fx 방식: ' + one(p.fxSource), 'products 출처: ' + (p.sources || []).map((s) => (typeof s === 'string' ? s : `<${s.url}> ${one(s.note)}`)).join(' ; '), 'note: ' + one(p.note), `품목 그림: ${p.image ? `${p.image.file} | ${p.image.license} | ${p.image.sourceUrl}` : '없음'}`, ''];
  for (const r of pc.rows) {
    const asT = wi.filter((x) => x.productId === p.productId && x.targetCc === r.cc).map((x) => x.id), asS = wi.filter((x) => x.productId === p.productId && x.shownCc.includes(r.cc)).length;
    L.push(`### ${p.productId}/${r.cc}  ${r.countryKo}  현지가 ${r.localPrice} ${r.currency}  → ${r.krw}원  출처 <${r.source}>  (목표 문항 ${asT.join(',') || '-'} · 보이는 문항 ${asS}회)`);
  }
  fs.writeFileSync(`${RAW}/_work/${pc.name}.txt`, L.join('\n') + '\n');
  fs.writeFileSync(`${RAW}/_work/${pc.name}.refs.json`, JSON.stringify(pc.rows.map((r) => `${p.productId}/${r.cc}`)));
  files[pc.name] = pc.rows.length;
}
fs.writeFileSync(RAW + '/_work/pieces.json', JSON.stringify(files));
console.log(JSON.stringify(sum, null, 1)); console.log(files);
