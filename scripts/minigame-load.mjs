#!/usr/bin/env node
// =============================================================================
// ★★★ 미니게임 항목 적재 (R052 · D-239 · docs/18 7절)
//
//   node scripts/minigame-load.mjs              ← 기본 dry-run: 읽기 · 형식 검사 · 표만 (DB 를 쓰지 않는다)
//   node scripts/minigame-load.mjs --apply      ← 쓰기 (★ 먼저 npm run db:backup)
//   node scripts/minigame-load.mjs --mark       ← 적재한 항목의 파일 status 를 'loaded' 로 (★ G010 몫 — MAIN 은 쓰지 않는다)
//   [--game price,photo]  게임 고르기
//   ★ G021: photoyear(18 §8)는 게임 코드가 없어 적재를 막았다 → ★ R068 게임을 만들고 GAMES_ALL 에 넣었다
//
// ★ 읽는 것: data/minigame/<game>/items*.json 전부(묶음 파일) + worldprice/products.json · 그림 assets/minigame/<game>/…
// ★ 형식 검사: docs/18 0~5절(g008-check 와 같은 규칙) — 모르는 칸 · 빠진 칸 · 숫자형 · 날짜 · id 꼴 · 게임별 규칙. 걸리면 그 항목 거부(목록)
// ★ 넣는 것: status 'verified'(또는 이미 'loaded') 만 — candidate · rejected 는 넣지 않는다. 같은 id 는 갱신(멱등).
//   payload = 파일 항목 그대로에서 verify 칸만 뺀 것. 그림은 bytea(minigame_images — 같은 그림 id 는 갱신).
//   그림 파일이 없으면 그 항목은 건너뛰고 목록에 남긴다(그림 없는 항목은 출제하지 않는다).
//   ★ R068 — 사진이 있어야 하는 게임(NEEDS_IMAGE: 얼마게요 · 사진 · 얼마나 · 어느 쪽?(양쪽) · 사진 연도)은 사진이 모자라면 적재하지 않는다(옛: 얼마나 · 어느 쪽? 은 null 도 됐다).
//   파일에서 빠졌거나 verified 가 아니게 된 항목은 DB 에서 active=false (지우지 않는다 — 경험 기록이 남아 있다).
// ★ 파일은 쓰지 않는다(--mark 만 예외 · G010 이 쓴다).
// =============================================================================
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MARK = args.includes('--mark');
const GAMES_ALL = ['price', 'worldprice', 'photo', 'estimate', 'which', 'photoyear'];
const GAMES = args.includes('--game') ? args[args.indexOf('--game') + 1].split(',') : GAMES_ALL;

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
const PHOTO_CAT = ['person', 'place', 'object', 'everyday', 'food', 'animal', 'logo'];
const EST_KIND = ['weight', 'calorie', 'count', 'length', 'height', 'distance', 'population', 'year', 'speed', 'price', 'other'];
const STATUS = ['candidate', 'verified', 'rejected', 'loaded'];
// ★ R068 (찬종 10-26 ① · 서버 defs NEEDS_IMAGE 와 같은 규칙) — 사진이 있어야 하는 게임 · 필요한 장 수(어느 쪽? = 양쪽). 모자라면 적재하지 않는다
const NEEDS_IMAGE = { price: 1, photo: 1, estimate: 1, which: 2, photoyear: 1 };
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** 그림 칸 검사 → 그림 하나 { imageId, file, … } 또는 문제 글 */
function imageOf(g, img) {
  if (img == null) return { none: true };
  for (const k of ['file', 'sourceUrl', 'license', 'attribution', 'width', 'height', 'bytes']) if (img[k] === undefined) return { problem: `image.${k} 없음` };
  if (!new RegExp(`^assets/minigame/${g}/[A-Za-z0-9_-]+\\.(jpg|jpeg|png|webp)$`).test(img.file)) return { problem: `그림 파일 이름 ${img.file}` };
  const f = path.join(ROOT, img.file);
  if (!existsSync(f)) return { missing: img.file };
  const st = statSync(f);
  if (st.size > 500 * 1024) return { problem: `500KB 초과 ${img.file}` };
  return {
    image: {
      imageId: path.basename(img.file).replace(/\.[^.]+$/, ''),
      file: f,
      mime: MIME[path.extname(img.file).toLowerCase()],
      width: img.width,
      height: img.height,
      bytes: st.size,
      license: img.license,
      attribution: img.attribution,
      sourceUrl: img.sourceUrl,
    },
  };
}

/** 항목 형식 검사 — 문제 목록(빈 배열이면 통과) */
function problems(g, it, products) {
  const p = [];
  if (!new RegExp(`^${g}-\\d{4}$`).test(it.id ?? '')) p.push('id 꼴');
  for (const k of [...COMMON, ...FIELDS[g]]) if (it[k] === undefined) p.push(`칸 없음 ${k}`);
  for (const k of Object.keys(it)) if (![...COMMON, ...FIELDS[g], ...OPTIONAL[g]].includes(k)) p.push(`모르는 칸 ${k}`);
  if (!STATUS.includes(it.status)) p.push(`status ${it.status}`);
  if (!Array.isArray(it.tags)) p.push('tags 배열');
  if (g === 'price') {
    if (!Number.isInteger(it.priceKrw) || it.priceKrw < 1000) p.push('priceKrw');
    if (!PRICE_CAT.includes(it.category)) p.push('category');
    if (!DATE.test(it.priceAsOf ?? '')) p.push('priceAsOf');
    if (typeof it.name !== 'string' || !it.name) p.push('name');
  }
  if (g === 'worldprice') {
    const pr = products.get(it.productId);
    if (!pr) p.push(`productId ${it.productId}`);
    else {
      const ccs = new Set(pr.rows.map((r) => r.cc));
      if (it.targetCc === 'KR' || it.targetCc === 'EU' || !ccs.has(it.targetCc)) p.push(`targetCc ${it.targetCc}`);
      if (!Array.isArray(it.shownCc) || it.shownCc.length !== 3 || !it.shownCc.includes('KR') || it.shownCc.includes(it.targetCc) || it.shownCc.some((c) => !ccs.has(c))) p.push('shownCc');
    }
  }
  if (g === 'photo') {
    if (!PHOTO_CAT.includes(it.category)) p.push('category');
    if (!['zoom', 'mosaic', 'plain'].includes(it.revealMode)) p.push('revealMode');
    if (typeof it.answer !== 'string' || !it.answer || !Array.isArray(it.altAnswers)) p.push('answer · altAnswers');
    if (it.image == null) p.push('그림 필수');
  }
  if (g === 'estimate') {
    if (!EST_KIND.includes(it.kind)) p.push('kind');
    if (typeof it.value !== 'number' || !(it.value > 0)) p.push('value > 0');
    if (!Number.isInteger(it.displayDecimals)) p.push('displayDecimals');
    if (it.asOf !== null && !DATE.test(it.asOf)) p.push('asOf');
  }
  if (g === 'photoyear') {
    if (!Number.isInteger(it.year) || it.year < 1826 || it.year > 2026) p.push('year');
    if (!['exact', 'circa'].includes(it.yearKind)) p.push('yearKind');
    if (it.yearKind === 'circa' ? !(Array.isArray(it.yearRange) && it.yearRange[0] <= it.year && it.year <= it.yearRange[1] && it.yearRange[1] - it.yearRange[0] <= 20) : it.yearRange !== null) p.push('yearRange');
    if (!['kr', 'world'].includes(it.region)) p.push('region');
    if (![1, 2, 3].includes(it.difficulty)) p.push('difficulty');
    if (it.image == null) p.push('그림 필수');
  }
  if (g === 'which') {
    if (!['bigger', 'earlier'].includes(it.kind)) p.push('kind');
    for (const s of ['a', 'b']) if (!it[s] || typeof it[s].label !== 'string' || typeof it[s].value !== 'number' || it[s].image === undefined) p.push(`${s} 칸`);
    if (!['a', 'b'].includes(it.answer)) p.push('answer');
    else if (it.a && it.b) {
      const want = it.kind === 'bigger' ? (it.a.value > it.b.value ? 'a' : 'b') : it.a.value < it.b.value ? 'a' : 'b';
      if (it.answer !== want) p.push(`answer ${it.answer} ≠ ${want}`);
    }
  }
  return p;
}

// ★ photoyear 의 year 는 정답(촬영 연도)이지 수집 기준 날짜가 아니다 → as_of null (G021)
const asOfOf = (g, it) => (g === 'price' ? it.priceAsOf : g === 'estimate' || g === 'which' ? it.asOf : null);

// ── 읽기
const products = new Map();
const productImages = [];
const pp = path.join(ROOT, 'data/minigame/worldprice/products.json');
if (GAMES.includes('worldprice') && existsSync(pp)) {
  for (const x of JSON.parse(readFileSync(pp, 'utf8')).products) {
    products.set(x.productId, x);
    const im = imageOf('worldprice', x.image);
    if (im.image) productImages.push({ productId: x.productId, image: im.image });
  }
}
const table = [];
const rows = [];
const rejected = [];
const noImage = [];
const files = {};
for (const g of GAMES) {
  const dir = path.join(ROOT, 'data/minigame', g);
  if (!existsSync(dir)) continue;
  const list = readdirSync(dir).filter((f) => /^items(-\d+)?\.json$/.test(f)).sort();
  const t = { game: g, files: list.join(' '), total: 0, verified: 0, candidate: 0, rejected: 0, loaded: 0, bad: 0, noImage: 0, put: 0 };
  const seen = new Set();
  for (const f of list) {
    const doc = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    files[`${g}/${f}`] = doc;
    if (doc.game !== g || doc.version !== 1) {
      rejected.push(`${g}/${f}: 파일 머리`);
      continue;
    }
    for (const it of doc.items) {
      t.total += 1;
      t[it.status] = (t[it.status] ?? 0) + 1;
      if (seen.has(it.id)) {
        rejected.push(`${it.id}: id 중복(${f})`);
        t.bad += 1;
        continue;
      }
      seen.add(it.id);
      if (it.status !== 'verified' && it.status !== 'loaded') continue;
      const pr = problems(g, it, products);
      if (pr.length) {
        rejected.push(`${it.id}: ${pr.join(' · ')}`);
        t.bad += 1;
        continue;
      }
      // 그림 — 항목 그림 · 어느 쪽 a/b
      const imgs = [];
      let missing = null;
      let bad = null;
      const take = (img) => {
        const r = imageOf(g, img);
        if (r.missing) missing = r.missing;
        else if (r.problem) bad = r.problem;
        else if (r.image) imgs.push(r.image);
      };
      take(it.image);
      if (g === 'which') {
        take(it.a.image);
        take(it.b.image);
      }
      if (bad) {
        rejected.push(`${it.id}: ${bad}`);
        t.bad += 1;
        continue;
      }
      if (missing) {
        noImage.push(`${it.id}: ${missing}`);
        t.noImage += 1;
        continue;
      }
      if (imgs.length < (NEEDS_IMAGE[g] ?? 0)) {
        noImage.push(`${it.id}: 사진 ${imgs.length}/${NEEDS_IMAGE[g]}장(사진 없는 항목 — R068)`);
        t.noImage += 1;
        continue;
      }
      const { verify, ...payload } = it;
      void verify;
      const attribution = [...new Set(imgs.map((x) => x.attribution).filter(Boolean))].join(' · ') || null;
      rows.push({ id: it.id, game: g, status: it.status, payload, images: imgs, attribution, asOf: asOfOf(g, it), tags: it.tags, file: `data/minigame/${g}/${f}` });
      t.put += 1;
    }
  }
  table.push(t);
}

// ── 표
const pad = (s, n) => String(s).padEnd(n);
console.log(`[minigame-load] ${APPLY ? '★ 쓰기(--apply)' : 'dry-run (DB 를 쓰지 않는다)'}`);
console.log(`${pad('게임', 11)}${pad('파일', 14)}${pad('전체', 6)}${pad('verified', 9)}${pad('candidate', 10)}${pad('rejected', 9)}${pad('loaded', 7)}${pad('형식거부', 9)}${pad('그림없음', 9)}넣을 것`);
for (const t of table) console.log(`${pad(t.game, 11)}${pad(t.files, 14)}${pad(t.total, 6)}${pad(t.verified, 9)}${pad(t.candidate, 10)}${pad(t.rejected, 9)}${pad(t.loaded ?? 0, 7)}${pad(t.bad, 9)}${pad(t.noImage, 9)}${t.put}`);
console.log(`합: 넣을 항목 ${rows.length} · 그림 ${new Set(rows.flatMap((r) => r.images.map((i) => i.imageId))).size + productImages.length} · 품목 ${products.size}`);
if (rejected.length) console.log(`형식 거부 ${rejected.length}:\n  ${rejected.join('\n  ')}`);
if (noImage.length) console.log(`그림 파일 없음(건너뜀) ${noImage.length}:\n  ${noImage.join('\n  ')}`);

if (MARK) {
  // ★ G010 몫 — 파일 status 를 loaded 로 (적재된 항목만). MAIN 은 부르지 않는다
  const ids = new Set(rows.map((r) => r.id));
  for (const [k, doc] of Object.entries(files)) {
    let n = 0;
    for (const it of doc.items) if (ids.has(it.id) && it.status === 'verified') {
      it.status = 'loaded';
      n += 1;
    }
    if (n) writeFileSync(path.join(ROOT, 'data/minigame', k), JSON.stringify(doc, null, 1) + '\n'); // ★ G021 — 파일은 1칸 들여쓰기(GEN 이 쓴 꼴 그대로)
    console.log(`[mark] ${k} loaded ${n}`);
  }
}

if (!APPLY) process.exit(0);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
try {
  await db.query('BEGIN');
  const putImage = async (im) => {
    await db.query(
      `INSERT INTO minigame_images (image_id, mime, width, height, bytes, data, license, attribution, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (image_id) DO UPDATE SET mime=EXCLUDED.mime, width=EXCLUDED.width, height=EXCLUDED.height, bytes=EXCLUDED.bytes, data=EXCLUDED.data,
         license=EXCLUDED.license, attribution=EXCLUDED.attribution, source_url=EXCLUDED.source_url, loaded_at=now()`,
      [im.imageId, im.mime, im.width, im.height, im.bytes, readFileSync(im.file), im.license, im.attribution, im.sourceUrl],
    );
  };
  for (const pi of productImages) await putImage(pi.image);
  for (const [pid, x] of products) {
    const { image, ...payload } = x;
    void image;
    const im = productImages.find((p) => p.productId === pid);
    await db.query(
      `INSERT INTO minigame_products (product_id, payload, image_id, as_of, fx_as_of) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (product_id) DO UPDATE SET payload=EXCLUDED.payload, image_id=EXCLUDED.image_id, as_of=EXCLUDED.as_of, fx_as_of=EXCLUDED.fx_as_of, loaded_at=now()`,
      [pid, payload, im?.image.imageId ?? null, x.asOf, x.fxAsOf],
    );
  }
  for (const r of rows) {
    for (const im of r.images) await putImage(im);
    await db.query(
      `INSERT INTO minigame_items (item_id, game, status, payload, image_ids, attribution, as_of, tags, source_file, active)
       VALUES ($1,$2,'loaded',$3,$4,$5,$6,$7,$8,true)
       ON CONFLICT (item_id) DO UPDATE SET game=EXCLUDED.game, status='loaded', payload=EXCLUDED.payload, image_ids=EXCLUDED.image_ids,
         attribution=EXCLUDED.attribution, as_of=EXCLUDED.as_of, tags=EXCLUDED.tags, source_file=EXCLUDED.source_file, active=true, loaded_at=now()`,
      [r.id, r.game, r.payload, r.images.map((i) => i.imageId), r.attribution, r.asOf, r.tags, r.file],
    );
  }
  // 이번에 넣지 않은 항목(파일에서 빠짐 · verified 아님) → 쉬게 한다(지우지 않는다)
  const off = await db.query(`UPDATE minigame_items SET active=false WHERE game = ANY($1) AND active AND NOT (item_id = ANY($2)) RETURNING item_id`, [GAMES, rows.map((r) => r.id)]);
  await db.query('COMMIT');
  const after = await db.query(`SELECT game, count(*)::int n FROM minigame_items WHERE active GROUP BY game ORDER BY game`);
  const imgs = await db.query(`SELECT count(*)::int n, coalesce(sum(bytes),0)::bigint b FROM minigame_images`);
  console.log(`[apply] 넣음 ${rows.length} · 쉬게 함 ${off.rowCount} · 활성 ${after.rows.map((x) => `${x.game} ${x.n}`).join(' · ')} · 그림 ${imgs.rows[0].n}장 ${(Number(imgs.rows[0].b) / 1048576).toFixed(1)}MB`);
} catch (err) {
  await db.query('ROLLBACK');
  console.error('[apply] ★ 실패 — 되돌림:', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
