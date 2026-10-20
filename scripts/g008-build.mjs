#!/usr/bin/env node
// =============================================================================
// G008 — 미니게임 데이터 정본 만들기 (docs/18 형식 v1 · ★ DB 를 쓰지 않는다)
//   입력  tmp/g008/out/<game>-<part>.json (하위 에이전트 중간 파일 · 항목 배열) · tmp/g008/out/worldprice-products.json
//   출력  data/minigame/<game>/items.json · data/minigame/worldprice/products.json
//         data/pipeline/audit/g008-verify-targets.json (게임별 · 항목 전문 · 그림 경로 · VERIFY 무작위 표본 표시)
//   ★ worldprice items 는 여기서 만든다: (품목 × KR 제외 나라) — netflix 는 자국 통화 요금이 있는 나라 + 미국만(같은 USD 요금 나라는 뺀다 · DG-035)
//     shownCc = KR + 목표 제외 2곳(시드 고정 무작위)
//   ★ 멱등: 같은 입력이면 같은 출력
//   (G010) --round g010 → 입력 tmp/g010/out · 출력 data/minigame/<game>/items-2.json(묶음 파일 — docs/18 0절) ·
//          worldprice-products.json 의 새 품목만 products.json 끝에 더한다(기존 품목은 글자 하나도 바꾸지 않는다 — 바뀌면 멈춘다) ·
//          worldprice 문항은 새 품목만 · id 는 1차 다음 번호부터 · data/pipeline/audit/g010-verify-targets.json(전수 — 표본 표시 없음)
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUND = process.argv.includes('--round') ? process.argv[process.argv.indexOf('--round') + 1] : 'g008';
if (!['g008', 'g010', 'g018'].includes(ROUND)) { console.error('--round g008 | g010 | g018'); process.exit(1); }
if (ROUND === 'g010') { buildG010(); process.exit(0); }
if (ROUND === 'g018') { buildG018(); process.exit(0); }
// (G018) 입력 tmp/g018/out · 출력 items-3.json(price · photo · estimate · which) · data/minigame/photoyear/items.json(새 게임 1차 — docs/18 §8) ·
//   worldprice: tmp/g018/out/worldprice-rows.json { rows: { <productId>: [row…] } } 을 기존 품목 rows **끝에 덧붙인다**(기존 rows · 다른 칸은 글자 그대로 — 바뀌면 멈춤) ·
//   worldprice 문항은 덧붙인 나라만(items-3.json · id 는 1·2차 가장 큰 번호 다음 — 멱등) · data/pipeline/audit/g018-mg-verify-targets.json(전수)
function buildG018() {
  const OUT3 = path.join(ROOT, 'tmp/g018/out'); const AS3 = '2026-10-21'; const J3 = (q) => JSON.parse(readFileSync(q, 'utf8'));
  const w3 = (q, o) => { mkdirSync(path.dirname(q), { recursive: true }); writeFileSync(q, JSON.stringify(o, null, 1) + '\n'); };
  const res3 = {};
  for (const g of ['price', 'photo', 'estimate', 'which', 'photoyear']) {
    const parts = readdirSync(OUT3).filter((f) => f.startsWith(`${g}-`) && f.endsWith('.json') && !f.endsWith('.log.json') && !f.includes('blind')).sort();
    const items = parts.flatMap((f) => { const x = J3(path.join(OUT3, f)); return Array.isArray(x) ? x : x.items; }).sort((x, y) => x.id.localeCompare(y.id));
    if (!items.length) continue;
    w3(path.join(ROOT, g === 'photoyear' ? 'data/minigame/photoyear/items.json' : `data/minigame/${g}/items-3.json`), { game: g, version: 1, asOf: AS3, items });
    res3[g] = items;
  }
  const rp = path.join(OUT3, 'worldprice-rows.json');
  if (existsSync(rp)) {
    const pfile = path.join(ROOT, 'data/minigame/worldprice/products.json');
    const old = J3(pfile); const add = J3(rp).rows;
    const merged = { ...old, products: old.products.map((x) => { const extra = (add[x.productId] ?? []).filter((r) => !x.rows.some((o) => o.cc === r.cc)); return extra.length ? { ...x, rows: [...x.rows, ...extra] } : x; }) };
    for (const [i, x] of old.products.entries()) {
      const m = merged.products[i];
      if (JSON.stringify(x.rows) !== JSON.stringify(m.rows.slice(0, x.rows.length)) || JSON.stringify({ ...x, rows: 0 }) !== JSON.stringify({ ...m, rows: 0 })) throw new Error('★ 기존 품목이 바뀐다 — 멈춤');
    }
    w3(pfile, merged);
    const prev = ['items.json', 'items-2.json'].map((f) => path.join(ROOT, 'data/minigame/worldprice', f)).filter(existsSync).flatMap((f) => J3(f).items);
    let n = Math.max(...prev.map((x) => Number(x.id.slice(-4))));
    let sd = 20261021; const r3 = () => ((sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648);
    const items = [];
    for (const [pid, rows] of Object.entries(add)) {
      const pr = merged.products.find((x) => x.productId === pid);
      for (const r of rows.filter((x) => x.cc !== 'KR' && x.cc !== 'EU')) {
        const others = pr.rows.filter((x) => x.cc !== 'KR' && x.cc !== 'EU' && x.cc !== r.cc).map((x) => [r3(), x.cc]).sort((u, v) => u[0] - v[0]).slice(0, 2).map((x) => x[1]);
        items.push({ id: `worldprice-${String(++n).padStart(4, '0')}`, productId: pid, targetCc: r.cc, shownCc: ['KR', ...others],
          status: 'candidate', createdRound: 'G018', sources: [{ url: r.source, note: `${r.countryKo} ${pr.nameKo} ${r.localPrice} ${r.currency} · 환율 ${pr.fxAsOf}`, fetchedAt: AS3 }],
          image: null, tags: [pid, r.countryKo], verify: null });
      }
    }
    w3(path.join(ROOT, 'data/minigame/worldprice/items-3.json'), { game: 'worldprice', version: 1, asOf: AS3, items });
    res3.worldprice = items;
  }
  const targets = {};
  for (const [g, items] of Object.entries(res3)) targets[g] = { count: items.length, items };
  if (existsSync(rp)) targets.worldprice.addedRows = J3(rp).rows;
  w3(path.join(ROOT, 'data/pipeline/audit/g018-mg-verify-targets.json'), { round: 'G018', note: 'V023 미니게임 3차 재검증 대상 — docs/18 6장 · 전수 · 묶음 파일 items-3.json + 새 게임 photoyear/items.json(§8) · worldprice 는 기존 품목 끝에 덧붙인 나라 행(addedRows)과 그 문항 · 그림은 assets/minigame/ (git 밖 — backups/minigame-g018.zip)', games: targets });
  console.log(Object.entries(res3).map(([g, x]) => `${g} ${x.length}`).join(' · '));
}
function buildG010() {
  const OUT2 = path.join(ROOT, 'tmp/g010/out'); const AS2 = '2026-10-18'; const J2 = (q) => JSON.parse(readFileSync(q, 'utf8'));
  const w2 = (q, o) => { mkdirSync(path.dirname(q), { recursive: true }); writeFileSync(q, JSON.stringify(o, null, 1) + '\n'); };
  const res2 = {};
  for (const g of ['price', 'photo', 'estimate', 'which']) {
    const parts = readdirSync(OUT2).filter((f) => new RegExp(`^${g}-\\d+\\.json$`).test(f)).sort();
    const items = parts.flatMap((f) => { const x = J2(path.join(OUT2, f)); return Array.isArray(x) ? x : x.items; }).sort((x, y) => x.id.localeCompare(y.id));
    if (!items.length) continue;
    w2(path.join(ROOT, `data/minigame/${g}/items-2.json`), { game: g, version: 1, asOf: AS2, items });
    res2[g] = items;
  }
  const np = path.join(OUT2, 'worldprice-products.json');
  if (existsSync(np)) {
    const pfile = path.join(ROOT, 'data/minigame/worldprice/products.json');
    const old = J2(pfile); const add = J2(np).products; const addIds = new Set(add.map((x) => x.productId));
    const FIRST = ['bigmac', 'iphone', 'netflix'];
    if (add.some((x) => FIRST.includes(x.productId))) throw new Error('★ 1차 품목 id 를 새 품목으로 쓸 수 없다');
    const before = JSON.stringify(old.products.filter((x) => FIRST.includes(x.productId)));
    const merged = { ...old, products: [...old.products.filter((x) => !addIds.has(x.productId)), ...add] };
    if (JSON.stringify(merged.products.filter((x) => FIRST.includes(x.productId))) !== before) throw new Error('★ 1차 품목이 바뀐다 — 멈춤');
    w2(pfile, merged);
    // 문항 — 새 품목만 · id 는 1차 items.json 의 가장 큰 번호 다음부터(멱등) · 목표 나라는 KR · EU 제외(CV-25)
    let n = Math.max(...J2(path.join(ROOT, 'data/minigame/worldprice/items.json')).items.map((x) => Number(x.id.slice(-4))));
    let sd = 20261018; const r2 = () => ((sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648);
    const items = [];
    for (const pr of add) for (const r of pr.rows.filter((x) => x.cc !== 'KR' && x.cc !== 'EU')) {
      const others = pr.rows.filter((x) => x.cc !== 'KR' && x.cc !== r.cc).map((x) => [r2(), x.cc]).sort((u, v) => u[0] - v[0]).slice(0, 2).map((x) => x[1]);
      items.push({ id: `worldprice-${String(++n).padStart(4, '0')}`, productId: pr.productId, targetCc: r.cc, shownCc: ['KR', ...others],
        status: 'candidate', createdRound: 'G010', sources: [{ url: r.source, note: `${r.countryKo} ${pr.nameKo} ${r.localPrice} ${r.currency} (${pr.asOf}) · 환율 ${pr.fxAsOf}`, fetchedAt: AS2 }],
        image: null, tags: [pr.productId, r.countryKo], verify: null });
    }
    w2(path.join(ROOT, 'data/minigame/worldprice/items-2.json'), { game: 'worldprice', version: 1, asOf: AS2, items });
    res2.worldprice = items;
  }
  const targets = {};
  for (const [g, items] of Object.entries(res2)) targets[g] = { count: items.length, items };
  if (existsSync(np)) targets.worldprice.products = J2(np).products;
  w2(path.join(ROOT, 'data/pipeline/audit/g010-verify-targets.json'), { round: 'G010', note: '다음 V(V014 자리) 미니게임 2차 재검증 대상 — docs/18 6장 · 전수(표본 표시 없음) · 묶음 파일 items-2.json · worldprice 는 새 품목(products 전문 포함) · 그림은 assets/minigame/ (git 밖 — backups/minigame-2026-10-<날짜>-2.zip)', games: targets });
  console.log(Object.entries(res2).map(([g, x]) => `${g} ${x.length}`).join(' · '));
}
// ★ (G010) 1차는 VERIFY 가 verify·status 를 채웠다 — G008 모드를 다시 돌리면 그 칸이 지워지므로 막는다
for (const g of ['price', 'photo', 'estimate', 'which', 'worldprice']) {
  const f = path.join(ROOT, `data/minigame/${g}/items.json`);
  if (existsSync(f) && JSON.parse(readFileSync(f, 'utf8')).items.some((x) => x.verify !== null)) { console.error(`★ ${g}/items.json 에 verify 가 있다 — G008 모드로 다시 만들지 않는다(--round g010)`); process.exit(1); }
}
const OUT = path.join(ROOT, 'tmp/g008/out');
const AS_OF = '2026-10-17';
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
let seed = 20261017; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const write = (p, o) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 1) + '\n'); };

const res = {};
for (const g of ['price', 'photo', 'estimate', 'which']) {
  const parts = readdirSync(OUT).filter((f) => new RegExp(`^${g}-\\d+\\.json$`).test(f) && !f.endsWith('.log.json')).sort();
  const items = parts.flatMap((f) => { const x = J(path.join(OUT, f)); return Array.isArray(x) ? x : x.items; }).sort((a, b) => a.id.localeCompare(b.id));
  if (!items.length) continue;
  write(path.join(ROOT, `data/minigame/${g}/items.json`), { game: g, version: 1, asOf: AS_OF, items });
  res[g] = items;
}
// worldprice
const pp = path.join(OUT, 'worldprice-products.json');
if (existsSync(pp)) {
  const prod = J(pp);
  write(path.join(ROOT, 'data/minigame/worldprice/products.json'), prod);
  const items = []; let n = 0;
  for (const p of prod.products) {
    let rows = p.rows.filter((r) => r.cc !== 'KR');
    if (p.productId === 'netflix') rows = rows.filter((r) => r.currency !== 'USD' || r.cc === 'US');
    for (const r of rows) {
      const others = p.rows.filter((x) => x.cc !== 'KR' && x.cc !== r.cc).map((x) => [rnd(), x.cc]).sort((a, b) => a[0] - b[0]).slice(0, 2).map((x) => x[1]);
      items.push({ id: `worldprice-${String(++n).padStart(4, '0')}`, productId: p.productId, targetCc: r.cc, shownCc: ['KR', ...others],
        status: 'candidate', createdRound: 'G008', sources: [{ url: r.source, note: `${r.countryKo} ${p.nameKo} ${r.localPrice} ${r.currency} (${p.asOf}) · 환율 ${prod.products.find((x) => x.productId === p.productId).fxAsOf}`, fetchedAt: AS_OF }],
        image: null, tags: [p.productId, r.countryKo], verify: null });
    }
  }
  write(path.join(ROOT, 'data/minigame/worldprice/items.json'), { game: 'worldprice', version: 1, asOf: AS_OF, items });
  res.worldprice = items;
}
// VERIFY 묶음 — 무작위 표본(브리핑: price 30 · worldprice 나라 10 · photo 40 · estimate 30 · which 40)
const SAMPLE = { price: 30, worldprice: 10, photo: 40, estimate: 30, which: 40 };
const targets = {};
for (const [g, items] of Object.entries(res)) {
  const pick = new Set(items.map((x) => [rnd(), x.id]).sort((a, b) => a[0] - b[0]).slice(0, SAMPLE[g]).map((x) => x[1]));
  targets[g] = { count: items.length, sample: [...pick].sort(), items: items.map((x) => ({ ...x, verifySample: pick.has(x.id) })) };
}
if (existsSync(pp)) targets.worldprice.products = J(pp).products.map((p) => ({ productId: p.productId, rows: p.rows.length, asOf: p.asOf, fxAsOf: p.fxAsOf, image: p.image?.file ?? null }));
write(path.join(ROOT, 'data/pipeline/audit/g008-verify-targets.json'), { round: 'G008', note: 'V011 미니게임 재검증 대상 — docs/18 6장. verifySample 이 true 인 것이 VERIFY 무작위 표본 · 그림은 assets/minigame/ (git 밖 — backups/minigame-<날짜>.zip)', games: targets });
console.log(Object.entries(res).map(([g, x]) => `${g} ${x.length}`).join(' · '));
