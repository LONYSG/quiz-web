#!/usr/bin/env node
// =============================================================================
// G008 — 미니게임 데이터 정본 만들기 (docs/18 형식 v1 · ★ DB 를 쓰지 않는다)
//   입력  tmp/g008/out/<game>-<part>.json (하위 에이전트 중간 파일 · 항목 배열) · tmp/g008/out/worldprice-products.json
//   출력  data/minigame/<game>/items.json · data/minigame/worldprice/products.json
//         data/pipeline/audit/g008-verify-targets.json (게임별 · 항목 전문 · 그림 경로 · VERIFY 무작위 표본 표시)
//   ★ worldprice items 는 여기서 만든다: (품목 × KR 제외 나라) — netflix 는 자국 통화 요금이 있는 나라 + 미국만(같은 USD 요금 나라는 뺀다 · DG-035)
//     shownCc = KR + 목표 제외 2곳(시드 고정 무작위)
//   ★ 멱등: 같은 입력이면 같은 출력
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
