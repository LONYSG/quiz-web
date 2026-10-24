// V024 setup — 대상 고정(읽기만) · 원칙 7 · 판정자 입력 조각
import fs from 'node:fs';
const ROOT = 'C:/work/quiz-web';
const RAW = ROOT + '/data/pipeline/audit/v024-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const games = {}; for (const g of ['price', 'photo', 'estimate', 'which']) games[g] = J(`${ROOT}/data/minigame/${g}/items-3.json`).items;
games.worldprice = J(`${ROOT}/data/minigame/worldprice/items-3.json`).items;
games.photoyear = J(`${ROOT}/data/minigame/photoyear/items.json`).items;
const tg = J(ROOT + '/data/pipeline/audit/g018-mg-verify-targets.json').games;
const prods = J(ROOT + '/data/minigame/worldprice/products.json').products;
const added = tg.worldprice.addedRows;
const sum = { counts: Object.fromEntries(Object.entries(games).map(([g, a]) => [g, a.length])), allCandidate: Object.values(games).every((a) => a.every((x) => x.status === 'candidate')), allVerifyNull: Object.values(games).every((a) => a.every((x) => x.verify === null)), addedRows: Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.length])), images: {}, missing: [] };
const imgOf = (it) => { const o = []; if (it.image) o.push(it.image.file); if (it.a?.image) o.push(it.a.image.file); if (it.b?.image) o.push(it.b.image.file); return o; };
for (const g of Object.keys(games)) { let n = 0; for (const it of games[g]) for (const f of imgOf(it)) { n++; if (!fs.existsSync(`${ROOT}/${f}`)) sum.missing.push(f); } sum.images[g] = n; }
sum.imagesTotal = Object.values(sum.images).reduce((a, b) => a + b, 0);
sum.addedMatch = {}; for (const [pid, rows] of Object.entries(added)) { const p = prods.find((x) => x.productId === pid); const tail = p.rows.slice(-rows.length); sum.addedMatch[pid] = JSON.stringify(tail.map((r) => { const { verify, ...o } = r; return o; })) === JSON.stringify(rows); }
fs.writeFileSync(RAW + '/_work/summary.json', JSON.stringify(sum, null, 1));
fs.writeFileSync(RAW + '/targets-ids.json', JSON.stringify({ frozenAt: new Date().toISOString(), ...Object.fromEntries(Object.entries(games).map(([g, a]) => [g, a.map((x) => x.id)])), addedRows: Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.map((r) => r.cc)])) }));

const img = (i) => i ? `그림: ${i.file} | ${i.license} | ${one(i.attribution)} | 원본 ${i.sourceUrl}` : '그림: 없음';
const src = (s) => (s || []).map((x) => `<${x.url}> «${one(x.note).slice(0, 260)}»`).join(' ; ');
const fmt = {
  price: (x) => [`### ${x.id}  ${x.name} (${x.brand}) · ${x.category} · 기록 가격 ${x.priceKrw}원 [${x.priceKind}] · asOf ${x.priceAsOf} · bucket ${x.bucket}`, img(x.image), '기록한 판매처: ' + x.priceSources.map((s) => `${s.seller} ${s.priceKrw}원 <${s.url}>`).join(' ; '), 'note: ' + one(x.note), 'sources: ' + src(x.sources), ''].join('\n'),
  photo: (x) => [`### ${x.id}  정답 «${x.answer}» 변형 ${JSON.stringify(x.altAnswers)} · ${x.category} · reveal ${x.revealMode} · GEN 난이도 ${x.difficulty}`, img(x.image), '해설: ' + one(x.explanation), 'sources: ' + src(x.sources), ''].join('\n'),
  estimate: (x) => [`### ${x.id}  [${x.kind}] ${x.question}  → 값 ${x.value} ${x.unit} (asOf ${x.asOf ?? '-'})`, img(x.image), '해설: ' + one(x.explanation), 'note: ' + one(x.note), 'sources: ' + src(x.sources), ''].join('\n'),
  which: (x) => [`### ${x.id}  [${x.kind}] ${x.stem} | A ${x.a.label}=${x.a.value} | B ${x.b.label}=${x.b.value} | 정답 ${x.answer} · ${x.unit} · margin ${x.margin} · asOf ${x.asOf}`, '그림 A: ' + (x.a.image ? `${x.a.image.file} | ${x.a.image.license} | ${one(x.a.image.attribution)} | ${x.a.image.sourceUrl}` : '없음'), '그림 B: ' + (x.b.image ? `${x.b.image.file} | ${x.b.image.license} | ${one(x.b.image.attribution)} | ${x.b.image.sourceUrl}` : '없음'), 'sources: ' + src(x.sources), ''].join('\n'),
  photoyear: (x) => [`### ${x.id}  year ${x.year} [${x.yearKind}${x.yearRange ? ' ' + JSON.stringify(x.yearRange) : ''}] · ${x.region} · ${x.place} · GEN 난이도 ${x.difficulty} · «${x.title}»`, img(x.image), 'cues: ' + one(x.cues), 'tags: ' + (x.tags || []).join(','), 'sources: ' + src(x.sources), ''].join('\n'),
};
const pieces = [];
const chunk = (g, size, name) => { const a = games[g]; for (let i = 0, k = 1; i < a.length; i += size, k++) pieces.push({ name: `${name}${k}`, game: g, items: a.slice(i, i + size) }); };
chunk('price', 25, 'price'); chunk('photo', 24, 'photo'); chunk('estimate', 25, 'estimate'); chunk('which', 30, 'which'); chunk('photoyear', 25, 'photoyear');
const hdr = (t) => `## ${t}\n\n`;
const files = {};
for (const pc of pieces) {
  fs.writeFileSync(`${RAW}/_work/${pc.name}.txt`, hdr(`${pc.game} 조각 ${pc.name} (${pc.items.length}건)`) + pc.items.map(fmt[pc.game]).join('\n'));
  fs.writeFileSync(`${RAW}/_work/${pc.name}.refs.json`, JSON.stringify(pc.items.map((x) => x.id)));
  files[pc.name] = pc.items.length;
}
const wi = games.worldprice;
for (const pid of ['iphone', 'cocacola', 'gasoline']) {
  const p = prods.find((x) => x.productId === pid); const rows = added[pid];
  const L = [hdr(`worldprice ${pid} (덧붙인 나라 행 ${rows.length}개) — 단위 ${p.unit} · 품목 asOf ${p.asOf} · fxAsOf ${p.fxAsOf}`), 'fx 방식: ' + one(p.fxSource), 'products 출처: ' + (p.sources || []).map((s) => (typeof s === 'string' ? s : `<${s.url}> ${one(s.note)}`)).join(' ; '), 'note: ' + one(p.note), `품목 그림: ${p.image ? `${p.image.file} | ${p.image.license} | ${p.image.sourceUrl}` : '없음'}`, `(참고) 기존 행 ${p.rows.length - rows.length}개는 이번 대상이 아니다 — 이 품목 기존 행 asOf 는 ${p.asOf}`, ''];
  for (const r of rows) {
    const it = wi.filter((x) => x.productId === pid && x.targetCc === r.cc);
    L.push(`### ${pid}/${r.cc}  ${r.countryKo}  현지가 ${r.localPrice} ${r.currency}  → ${r.krw}원  출처 <${r.source}>  (목표 문항 ${it.map((x) => x.id).join(',') || '-'}${it[0] ? ' · 문항 출처 «' + one(it[0].sources?.[0]?.note).slice(0, 160) + '»' : ''})`);
  }
  fs.writeFileSync(`${RAW}/_work/wp-${pid}.txt`, L.join('\n') + '\n');
  fs.writeFileSync(`${RAW}/_work/wp-${pid}.refs.json`, JSON.stringify(rows.map((r) => `${pid}/${r.cc}`)));
  files[`wp-${pid}`] = rows.length;
}
fs.writeFileSync(RAW + '/_work/pieces.json', JSON.stringify(files));
const mask = (s) => one(s).replace(/(1[89]\d\d|20[0-2]\d)\s*(~|-)\s*(\d{2,4})\s*년대?/g, '[연도]').replace(/(1[89]\d\d|20[0-2]\d)년대?/g, '[연도]').replace(/\d0년대/g, '[연도]').replace(/(1[89]\d\d|20[0-2]\d)/g, '[연도]');
const gp = games.photo; fs.writeFileSync(RAW + '/_work/guess-photo.txt', gp.map((x) => `${x.id} | ${x.image.file}`).join('\n') + '\n'); fs.writeFileSync(RAW + '/_work/guess-photo.refs.json', JSON.stringify(gp.map((x) => x.id)));
const gy = games.photoyear; fs.writeFileSync(RAW + '/_work/guess-photoyear.txt', gy.map((x) => `${x.id} | ${x.image.file} | cues: ${mask(x.cues)}`).join('\n') + '\n'); fs.writeFileSync(RAW + '/_work/guess-photoyear.refs.json', JSON.stringify(gy.map((x) => x.id)));
console.log(JSON.stringify(sum, null, 1)); console.log(files);
