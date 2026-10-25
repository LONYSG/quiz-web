#!/usr/bin/env node
// =============================================================================
// G021 — 가격 · 최신 정보 항목의 "수집 기준 날짜"(as_of) 세기 · 채우기 (찬종 2026-10-25 — 화면에 계속 보이게 · 그리기는 MAIN R067)
//   node scripts/g021-asof.mjs            세기만 — 게임 · 파일별 as_of 있음 / 없음(시간 무관) / 없음(채울 것)
//   node scripts/g021-asof.mjs --apply    채울 것(3차 3건)을 출처 fetchedAt 으로 채운다 + audit/g021-applied.json
// ★ 읽는 칸: price = priceAsOf · worldprice = products.json 품목 asOf(항목 칸 없음 — 품목마다) · estimate · which = asOf
// ★ 1·2차(items.json · items-2.json)는 세기만 — 값을 바꾸지 않는다(브리핑 "1·2차 항목 값 바꾸기 금지"). 없는 것은 모두 시간 무관이거나
//   질문에 연도가 박힌 옛 사실(1867 알래스카 · 2017 경매 …)이라 채울 것이 없다(G021 이 하나씩 읽음 — 0절).
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
// 3차 가운데 "지금 상태" 를 묻는데 as_of 가 빠진 것 — 출처 fetchedAt 으로
const FILL = { 'estimate-0203': '지금 성조기의 별 수(현재 상태)', 'estimate-0230': '베트남 인구 — 2019 인구조사 값(질문에 연도) · 수집 날짜를 둔다', 'estimate-0274': '지금의 10원 동전 무게(현재 규격)' };

const log = [];
const table = [];
for (const g of ['price', 'worldprice', 'estimate', 'which']) {
  const dir = path.join(ROOT, 'data/minigame', g);
  for (const f of readdirSync(dir).filter((x) => /^items(-\d+)?\.json$/.test(x)).sort()) {
    const p = path.join(dir, f); const doc = JSON.parse(readFileSync(p, 'utf8')); let changed = false;
    const row = { game: g, file: f, loaded: 0, has: 0, none: 0, filled: 0 };
    for (const it of doc.items) {
      if (it.status !== 'loaded' && it.status !== 'verified') continue;
      row.loaded++;
      if (FILL[it.id] && !it.asOf && f === 'items-3.json') {
        const at = it.sources.map((s) => s.fetchedAt).filter(Boolean).sort().at(-1);
        log.push({ id: it.id, key: 'asOf', before: it.asOf, after: at, why: `as_of 채움(출처 fetchedAt) — ${FILL[it.id]}` });
        if (APPLY) { it.asOf = at; changed = true; }
        row.filled++; row.has++; continue;
      }
      const asOf = g === 'price' ? it.priceAsOf : g === 'worldprice' ? 'products' : it.asOf;
      if (asOf) row.has++; else row.none++;
    }
    table.push(row);
    if (changed) writeFileSync(p, JSON.stringify(doc, null, 1) + '\n');
  }
}
console.log('| 게임 | 파일 | 적재 대상 | as_of 있음 | 없음(시간 무관 · 옛 사실) | 이번에 채움 |');
console.log('|---|---|---|---|---|---|');
for (const r of table) console.log(`| ${r.game} | ${r.file} | ${r.loaded} | ${r.has} | ${r.none} | ${r.filled} |`);
const pr = JSON.parse(readFileSync(path.join(ROOT, 'data/minigame/worldprice/products.json'), 'utf8')).products;
console.log(`worldprice 품목 asOf: ${pr.map((x) => `${x.productId} ${x.asOf}(환율 ${x.fxAsOf})`).join(' · ')}`);
if (APPLY && log.length) {
  const ap = path.join(ROOT, 'data/pipeline/audit/g021-applied.json'); const prev = JSON.parse(readFileSync(ap, 'utf8'));
  prev.runs.push({ at: new Date().toISOString(), script: 'g021-asof', changes: log }); writeFileSync(ap, JSON.stringify(prev, null, 1) + '\n');
}
console.log(`[g021-asof] ${APPLY ? '쓰기' : '세기만'} — 채울 것 ${log.length}`);
