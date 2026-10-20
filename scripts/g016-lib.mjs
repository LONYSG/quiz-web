// =============================================================================
// G016 — 미니게임 fix 반영 공통 (g016-apply-v012.mjs · g016-apply-v017.mjs 가 부른다)
//   결정 표 한 줄 = { id, take: 'proposal'|'modified'|'rejected'|'image', set: {'칸.경로': 값}, img: {slot: {sourceUrl, license, attribution}}, why }
//   - take 'rejected' → status rejected (다른 칸은 그대로)
//   - 그 밖 → set 을 적용하고 status verified (이미 verified/loaded 인 항목은 status 를 바꾸지 않는다 — CV-50 그림만 바꾼 항목)
//   - img 의 slot('image' · 'a.image' · 'b.image') 은 파일(assets/…)에서 width · height · bytes 를 다시 읽는다(교체 · 자른 그림)
//   - verify 칸은 VERIFY 의 기록이라 건드리지 않는다
//   - 멱등: 다시 돌려 바뀌는 것이 없으면 "그대로"
//   - 기록: data/pipeline/audit/g016-fixes.json 의 parts[<part>].rows[] = { id, file, take, why, before, after }
// =============================================================================
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = path.join(ROOT, 'data/pipeline/audit/g016-fixes.json');

const getAt = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setAt(o, p, v) {
  const ks = p.split('.');
  let x = o;
  for (const k of ks.slice(0, -1)) x = x[k];
  x[ks.at(-1)] = v;
}

export async function run(part, decisions) {
  const APPLY = process.argv.includes('--apply');
  const docs = new Map(); // rel → doc
  const find = (id) => {
    const g = id.split('-')[0];
    for (const f of ['items.json', 'items-2.json']) {
      const rel = `data/minigame/${g}/${f}`;
      if (!docs.has(rel)) docs.set(rel, JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')));
      const it = docs.get(rel).items.find((x) => x.id === id);
      if (it) return { rel, it };
    }
    throw new Error(`★ ${id} 없음`);
  };
  const rows = [];
  const tally = {};
  let changed = 0;
  for (const d of decisions) {
    const { rel, it } = find(d.id);
    const before = structuredClone(it);
    if (d.take === 'rejected') it.status = 'rejected';
    else {
      for (const [p, v] of Object.entries(d.set ?? {})) setAt(it, p, structuredClone(v));
      for (const [slot, meta] of Object.entries(d.img ?? {})) {
        const img = getAt(it, slot);
        if (!img) throw new Error(`★ ${d.id} ${slot} 그림 칸 없음`);
        Object.assign(img, meta);
        const f = path.join(ROOT, img.file);
        if (!existsSync(f)) throw new Error(`★ ${d.id} 그림 파일 없음 ${img.file}`);
        const m = await sharp(f).metadata();
        Object.assign(img, { width: m.width, height: m.height, bytes: statSync(f).size });
      }
      if (it.status === 'candidate') it.status = 'verified';
    }
    const same = JSON.stringify(before) === JSON.stringify(it);
    if (!same) changed += 1;
    tally[d.take] = (tally[d.take] ?? 0) + 1;
    const diff = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(it)])) if (JSON.stringify(before[k]) !== JSON.stringify(it[k])) diff[k] = it[k];
    rows.push({ id: d.id, file: rel, take: d.take, why: d.why, before: Object.fromEntries(Object.keys(diff).map((k) => [k, before[k]])), after: diff, unchanged: same || undefined });
  }
  console.log(`[g016 ${part}] 결정 ${decisions.length} · ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ')} · 이번에 바뀔 항목 ${changed}`);
  if (!APPLY) {
    console.log('(dry-run — --apply 로 쓴다)');
    return;
  }
  for (const [rel, doc] of docs) writeFileSync(path.join(ROOT, rel), JSON.stringify(doc, null, 1) + '\n');
  const audit = existsSync(AUDIT) ? JSON.parse(readFileSync(AUDIT, 'utf8')) : { round: 'G016', parts: {} };
  // 처음 쓸 때의 before 를 남긴다(다시 돌리면 before == after 라 원래 값이 사라지지 않게)
  const old = new Map((audit.parts[part]?.rows ?? []).map((r) => [r.id, r]));
  audit.parts[part] = {
    rows: rows.map((r) => (r.unchanged && old.has(r.id) ? old.get(r.id) : r)),
    tally,
  };
  writeFileSync(AUDIT, JSON.stringify(audit, null, 1) + '\n');
  console.log(`[g016 ${part}] 썼다 — ${[...docs.keys()].join(' · ')} · audit/g016-fixes.json`);
}
