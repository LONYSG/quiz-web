#!/usr/bin/env node
// =============================================================================
// G008 — 미니게임 데이터 기계 검사 (docs/18 형식 v1)
//   node scripts/g008-check.mjs [game ...]     (없으면 다섯 게임 전부 · data/minigame/<game>/items*.json 묶음 파일 전부 — docs/18 0절)
//   node scripts/g008-check.mjs --part <중간 파일> [--products <품목 파일>]   (하위 에이전트 중간 파일 — 정본 items*.json 과 합쳐 id · 같은 대상 겹침도 본다)
//   (G010) status ∈ candidate · verified · rejected · loaded · verify 는 null 또는 {round, …}(CV-28) · 같은 대상 겹침은 파일을 합쳐 막힘
//   막힘: 칸 빠짐 · 모르는 칸 · 숫자형 · 날짜 꼴 · id 꼴·유일 · status · 그림 파일 존재 · ≤1024px · ≤500KB ·
//         게임별 규칙(price 출처 2 · 1.5 · bucket · category / worldprice shownCc · rows / photo category · revealMode · 라이선스 /
//         estimate kind · 질문 '이것' / which margin 1.3 · 5년 · answer 맞음) · 정답 글자가 그림 파일 이름에 없음
//   경고: 같은 브랜드 3 넘음 · 균형
//   (G018) photoyear(docs/18 §8) — year 정수 · yearKind exact|circa · circa 면 yearRange [a, b] (a ≤ year ≤ b) · exact 면 null · region kr|world · 그림 필수(공용 자유 라이선스) · 같은 사진(sourceUrl) 겹침
//          --add-rows <파일> = { rows: { <productId>: [row…] } } — 기존 품목 끝에 덧붙일 나라 행(기존 행은 그대로)도 합쳐 검사
// =============================================================================
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// --part <파일>: 하위 에이전트의 중간 파일(항목 배열 · 이름이 <game>-<part>.json)을 검사한다
const PART = process.argv.includes('--part') ? process.argv[process.argv.indexOf('--part') + 1] : null;
const EXTRA_PRODUCTS = process.argv.includes('--products') ? process.argv[process.argv.indexOf('--products') + 1] : null;
const ADD_ROWS = process.argv.includes('--add-rows') ? process.argv[process.argv.indexOf('--add-rows') + 1] : null;
const ARGS = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !['--part', '--products', '--add-rows'].includes(all[i - 1]));
const GAMES = PART ? [path.basename(PART).split('-')[0]] : ARGS.length ? ARGS : ['price', 'worldprice', 'photo', 'estimate', 'which', 'photoyear'];
const STATUS = ['candidate', 'verified', 'rejected', 'loaded'];
// 묶음 파일 — items.json · items-2.json · items-3.json … (번호 순)
const bundleFiles = (g) => { const d = path.join(ROOT, `data/minigame/${g}`); return existsSync(d) ? readdirSync(d).filter((f) => /^items(-\d+)?\.json$/.test(f)).sort((a, b) => (Number(a.match(/-(\d+)/)?.[1] ?? 1)) - (Number(b.match(/-(\d+)/)?.[1] ?? 1))).map((f) => path.join(d, f)) : []; };
const readDoc = (p, g) => { const raw = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(raw) ? { game: g, version: 1, asOf: '2026-10-17', items: raw } : raw; };
const COMMON = ['id', 'status', 'createdRound', 'sources', 'image', 'tags', 'verify'];
const FIELDS = {
  price: ['name', 'brand', 'category', 'priceKrw', 'priceKind', 'priceAsOf', 'priceSources', 'bucket', 'note'],
  worldprice: ['productId', 'targetCc', 'shownCc'],
  photo: ['answer', 'altAnswers', 'category', 'revealMode', 'explanation', 'difficulty'],
  estimate: ['kind', 'question', 'value', 'unit', 'displayDecimals', 'asOf', 'explanation'],
  which: ['kind', 'stem', 'a', 'b', 'answer', 'unit', 'margin', 'asOf'],
  photoyear: ['year', 'yearKind', 'yearRange', 'title', 'place', 'region', 'difficulty', 'cues'],
};
const OPTIONAL = { estimate: ['note'], which: ['note', 'explanation'], price: [], photo: [], worldprice: [], photoyear: [] };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRICE_CAT = ['식품', '생활', '가전', '패션', '뷰티', '취미', '자동차', '사치품', '해외', '기타'];
const BUCKET = (p) => (p < 10000 ? '<1만' : p < 100000 ? '1~10만' : p < 1000000 ? '10~100만' : '100만+');
const PHOTO_CAT = ['person', 'place', 'object', 'everyday', 'food', 'animal', 'logo'];
const EST_KIND = ['weight', 'calorie', 'count', 'length', 'height', 'distance', 'population', 'year', 'speed', 'price', 'other'];
const FREE = /^(CC0|CC BY(-SA)? [0-9.]+( [A-Za-z]+)?|Public domain|PD.*|퍼블릭 도메인)/i;

let block = 0, warnN = 0, total = 0;
const B = (g, id, m) => { block++; console.log(`★ ${g} ${id}: ${m}`); };
const W = (g, id, m) => { warnN++; console.log(`  (경고) ${g} ${id}: ${m}`); };
async function checkImage(g, id, img, need, answers = []) {
  if (img == null) { if (need) B(g, id, '그림 없음'); return; }
  for (const k of ['file', 'sourceUrl', 'license', 'attribution', 'width', 'height', 'bytes']) if (img[k] === undefined) B(g, id, `image.${k} 없음`);
  const f = path.join(ROOT, img.file ?? '');
  if (!img.file || !existsSync(f)) { B(g, id, `그림 파일 없음 ${img.file}`); return; }
  if (!new RegExp(`^assets/minigame/${g}/${id}(-[ab])?\\.(jpg|png|webp)$`).test(img.file)) B(g, id, `그림 파일 이름 ${img.file}`);
  const st = statSync(f); if (st.size > 500 * 1024) B(g, id, `500KB 초과 ${st.size}`);
  const m = await sharp(f).metadata(); if (Math.max(m.width, m.height) > 1024) B(g, id, `1024px 초과 ${m.width}x${m.height}`);
  if (img.width !== m.width || img.height !== m.height || img.bytes !== st.size) B(g, id, `image 크기 칸이 파일과 다름`);
  for (const a of answers) if (a && normalizeAnswer(a).length >= 2 && normalizeAnswer(path.basename(img.file)).includes(normalizeAnswer(a))) B(g, id, '정답 글자가 그림 파일 이름에');
  if ((g === 'photo' || g === 'photoyear') && !FREE.test(img.license ?? '')) B(g, id, `자유 라이선스 아님 '${img.license}'`);
  if ((g === 'photo' || g === 'photoyear') && !/commons\.wikimedia\.org|upload\.wikimedia\.org/.test(img.sourceUrl ?? '')) B(g, id, '위키미디어 공용 밖 그림');
  if (!img.attribution) B(g, id, 'attribution 빈 칸');
}
for (const g of GAMES) {
  // 정본 묶음 파일 전부 + (--part 면) 중간 파일 — id 유일 · 같은 대상 겹침은 합쳐서 본다. --part 일 때 정본 항목은 겹침 대조에만 쓴다(검사 대상은 중간 파일)
  const docs = bundleFiles(g).map((p) => ({ p, doc: readDoc(p, g), main: !PART }));
  if (PART) docs.push({ p: path.resolve(PART), doc: readDoc(path.resolve(PART), g), main: true });
  if (!docs.length) { console.log(`(${g} 파일 없음)`); continue; }
  for (const { p, doc } of docs) if (doc.game !== g || doc.version !== 1 || !DATE.test(doc.asOf ?? '')) B(g, path.basename(p), '파일 머리(game · version · asOf)');
  const seen = new Set(); const names = new Map(); const brands = {};
  const dup = (k, id, what) => { if (names.has(k) && names.get(k) !== id) B(g, id, `${what} ${names.get(k)}`); else names.set(k, id); };
  let products = null;
  if (g === 'worldprice') {
    const pp = existsSync(path.join(ROOT, 'data/minigame/worldprice/products.json')) ? path.join(ROOT, 'data/minigame/worldprice/products.json') : path.join(ROOT, 'tmp/g008/out/worldprice-products.json');
    if (!existsSync(pp)) B(g, '-', 'products.json 없음');
    else {
      products = new Map(JSON.parse(readFileSync(pp, 'utf8')).products.map((x) => [x.productId, x]));
      if (ADD_ROWS) for (const [pid, rows] of Object.entries(JSON.parse(readFileSync(path.resolve(ADD_ROWS), 'utf8')).rows)) { const x = products.get(pid); if (!x) B(g, pid, '--add-rows 품목 없음'); else x.rows = [...x.rows, ...rows]; }
      if (EXTRA_PRODUCTS) for (const x of JSON.parse(readFileSync(path.resolve(EXTRA_PRODUCTS), 'utf8')).products) { if (products.has(x.productId)) B(g, x.productId, '품목 productId 가 이미 products.json 에'); products.set(x.productId, x); }
      for (const [pid, x] of products) {
        for (const k of ['productId', 'nameKo', 'unit', 'image', 'asOf', 'fxAsOf', 'fxSource', 'rows', 'sources', 'note']) if (x[k] === undefined) B(g, pid, `product.${k} 없음`);
        if (!DATE.test(x.asOf ?? '') || !DATE.test(x.fxAsOf ?? '')) B(g, pid, '날짜 꼴');
        const ccs = new Set();
        for (const r of x.rows ?? []) {
          for (const k of ['cc', 'countryKo', 'localPrice', 'currency', 'krw', 'source']) if (r[k] === undefined) B(g, pid, `row ${r.cc}.${k} 없음`);
          if (typeof r.localPrice !== 'number' || !Number.isInteger(r.krw)) B(g, pid, `row ${r.cc} 숫자형`);
          if (ccs.has(r.cc)) B(g, pid, `row ${r.cc} 중복`); ccs.add(r.cc);
        }
        if (!ccs.has('KR')) B(g, pid, 'KR row 없음');
        await checkImage(g, pid, x.image, true);
      }
    }
  }
  for (const { doc, main } of docs) for (const it of doc.items) {
    const id = it.id;
    if (!main) { // --part: 정본 항목은 id · 같은 대상 대조용으로만 등록
      seen.add(id); const key0 = (s) => normalizeAnswer(String(s ?? ''));
      if (g === 'price') names.set(key0(it.name), id);
      if (g === 'worldprice') names.set(`${it.productId}|${it.targetCc}`, id);
      if (g === 'photo') for (const a of [it.answer, ...(it.altAnswers ?? [])]) names.set(key0(a), id);
      if (g === 'estimate') names.set(key0(it.question), id);
      if (g === 'photoyear') { names.set(String(it.image?.sourceUrl ?? ''), id); names.set(key0(it.title), id); }
      if (g === 'which') names.set([key0(it.a?.label), key0(it.b?.label)].sort().join('|') + '|' + key0(it.stem), id);
      continue;
    }
    total++;
    if (!new RegExp(`^${g}-\\d{4}$`).test(id ?? '')) B(g, id, 'id 꼴');
    if (seen.has(id)) B(g, id, 'id 중복'); seen.add(id);
    for (const k of [...COMMON, ...FIELDS[g]]) if (it[k] === undefined) B(g, id, `칸 없음 ${k}`);
    for (const k of Object.keys(it)) if (![...COMMON, ...FIELDS[g], ...OPTIONAL[g]].includes(k)) B(g, id, `모르는 칸 ${k}`);
    if (!STATUS.includes(it.status)) B(g, id, `status ${it.status}`);
    if (it.verify !== null && (typeof it.verify !== 'object' || Array.isArray(it.verify) || typeof it.verify.round !== 'string')) B(g, id, 'verify 는 null 또는 {round, …}');
    if (!/^G\d{3}$/.test(it.createdRound ?? '')) B(g, id, 'createdRound');
    if (!Array.isArray(it.tags)) B(g, id, 'tags 배열');
    if (!Array.isArray(it.sources) || (g !== 'worldprice' && !it.sources.length)) B(g, id, 'sources');
    for (const s of it.sources ?? []) if (!s.url || !s.fetchedAt || !DATE.test(s.fetchedAt)) B(g, id, 'sources 칸(url · note · fetchedAt)');
    const key = (s) => normalizeAnswer(String(s ?? ''));
    if (g === 'price') {
      if (!Number.isInteger(it.priceKrw) || it.priceKrw < 1000) B(g, id, 'priceKrw 정수 · 1,000원 이상');
      if (!['official', 'median'].includes(it.priceKind)) B(g, id, 'priceKind');
      if (!PRICE_CAT.includes(it.category)) B(g, id, `category ${it.category}`);
      if (it.bucket !== BUCKET(it.priceKrw)) B(g, id, `bucket ${it.bucket} ≠ ${BUCKET(it.priceKrw)}`);
      if (!DATE.test(it.priceAsOf ?? '')) B(g, id, 'priceAsOf');
      const ps = (it.priceSources ?? []).map((x) => x.priceKrw);
      if (ps.length < 2 || ps.some((x) => !Number.isInteger(x))) B(g, id, 'priceSources 2곳 이상 · 정수');
      else if (Math.max(...ps) / Math.min(...ps) > 1.5) B(g, id, `최고/최저 ${(Math.max(...ps) / Math.min(...ps)).toFixed(2)} > 1.5`);
      for (const s of it.priceSources ?? []) if (!s.url || !s.seller || !DATE.test(s.fetchedAt ?? '')) B(g, id, 'priceSources 칸');
      brands[it.brand] = (brands[it.brand] ?? 0) + 1;
      await checkImage(g, id, it.image, true, [it.name]);
      dup(key(it.name), id, '같은 대상');
    }
    if (g === 'worldprice') {
      const pr = products?.get(it.productId); if (!pr) { B(g, id, `productId ${it.productId}`); continue; }
      const ccs = new Set(pr.rows.map((r) => r.cc));
      if (it.targetCc === 'KR' || !ccs.has(it.targetCc)) B(g, id, `targetCc ${it.targetCc}`);
      if (!Array.isArray(it.shownCc) || it.shownCc.length !== 3 || !it.shownCc.includes('KR') || it.shownCc.includes(it.targetCc) || it.shownCc.some((c) => !ccs.has(c)) || new Set(it.shownCc).size !== 3) B(g, id, `shownCc ${JSON.stringify(it.shownCc)}`);
      dup(`${it.productId}|${it.targetCc}`, id, '(품목, 나라) 중복');
      if (it.image !== null) await checkImage(g, id, it.image, false);
    }
    if (g === 'photo') {
      if (!PHOTO_CAT.includes(it.category)) B(g, id, `category ${it.category}`);
      if (!['zoom', 'mosaic', 'plain'].includes(it.revealMode)) B(g, id, `revealMode ${it.revealMode}`);
      if (!Number.isInteger(it.difficulty) || it.difficulty < 1 || it.difficulty > 3) B(g, id, 'difficulty 1~3');
      if (!Array.isArray(it.altAnswers)) B(g, id, 'altAnswers 배열');
      await checkImage(g, id, it.image, true, [it.answer, ...(it.altAnswers ?? [])]);
      for (const a of [it.answer, ...(it.altAnswers ?? [])]) dup(key(a), id, `같은 정답 '${a}'`);
    }
    if (g === 'estimate') {
      if (!EST_KIND.includes(it.kind)) B(g, id, `kind ${it.kind}`);
      if (typeof it.value !== 'number' || !(it.value > 0)) B(g, id, 'value 숫자 > 0');
      if (!Number.isInteger(it.displayDecimals)) B(g, id, 'displayDecimals 정수');
      if (it.asOf !== null && !DATE.test(it.asOf)) B(g, id, 'asOf 날짜 또는 null');
      if (/이것|이거/.test(it.question ?? '')) B(g, id, "질문에 '이것'");
      if (it.image !== null) await checkImage(g, id, it.image, false);
      dup(key(it.question), id, '같은 질문');
    }
    if (g === 'photoyear') {
      if (!Number.isInteger(it.year) || it.year < 1826 || it.year > 2026) B(g, id, 'year 정수 1826~2026');
      if (!['exact', 'circa'].includes(it.yearKind)) B(g, id, `yearKind ${it.yearKind}`);
      if (it.yearKind === 'circa') { const r = it.yearRange; if (!Array.isArray(r) || r.length !== 2 || !r.every(Number.isInteger) || !(r[0] <= it.year && it.year <= r[1]) || r[1] - r[0] > 20) B(g, id, 'circa 는 yearRange [a, b] · a ≤ year ≤ b · 폭 20 이하'); }
      else if (it.yearRange !== null) B(g, id, 'exact 면 yearRange null');
      if (!['kr', 'world'].includes(it.region)) B(g, id, `region ${it.region}`);
      if (!Number.isInteger(it.difficulty) || it.difficulty < 1 || it.difficulty > 3) B(g, id, 'difficulty 1~3');
      for (const k of ['title', 'place', 'cues']) if (typeof it[k] !== 'string' || !it[k]) B(g, id, `${k} 글`);
      await checkImage(g, id, it.image, true);
      dup(String(it.image?.sourceUrl ?? ''), id, '같은 사진');
      dup(key(it.title), id, '같은 제목');
    }
    if (g === 'which') {
      if (!['bigger', 'earlier'].includes(it.kind)) B(g, id, `kind ${it.kind}`);
      for (const s of ['a', 'b']) { const x = it[s]; if (!x || !x.label || typeof x.value !== 'number' || x.image === undefined) B(g, id, `${s} 칸(label · value 숫자 · image)`); else if (x.image !== null) await checkImage(g, id, { ...x.image }, false); }
      if (it.a && it.b && typeof it.a.value === 'number' && typeof it.b.value === 'number') {
        const want = it.kind === 'bigger' ? (it.a.value > it.b.value ? 'a' : 'b') : (it.a.value < it.b.value ? 'a' : 'b');
        if (it.answer !== want) B(g, id, `answer ${it.answer} ≠ ${want}`);
        const m = it.kind === 'bigger' ? Math.max(it.a.value, it.b.value) / Math.min(it.a.value, it.b.value) : Math.abs(it.a.value - it.b.value);
        if (it.kind === 'bigger' && m < 1.3) B(g, id, `비율 ${m.toFixed(2)} < 1.3`);
        if (it.kind === 'earlier' && m < 5) B(g, id, `연 차이 ${m} < 5`);
        if (typeof it.margin !== 'number' || Math.abs(it.margin - m) > (it.kind === 'bigger' ? 0.01 : 0)) B(g, id, `margin ${it.margin} ≠ ${it.kind === 'bigger' ? m.toFixed(2) : m}`);
      }
      dup([key(it.a?.label), key(it.b?.label)].sort().join('|') + '|' + key(it.stem), id, '같은 짝');
    }
  }
  if (g === 'price') for (const [b, n] of Object.entries(brands)) if (n > 3) W(g, '-', `같은 브랜드 ${b} ${n}개(3 이하)`);
  console.log(`[g008-check] ${g} ${docs.filter((d) => d.main).map((d) => `${path.basename(d.p)} ${d.doc.items.length}`).join(' · ')}건`);
}
console.log(`[g008-check] 합 ${total}건 · 막힘 ${block} · 경고 ${warnN}`);
process.exit(block ? 1 : 0);
