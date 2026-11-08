#!/usr/bin/env node
// =============================================================================
// G042 — 주제 세트 V040 fixes 기계 적용(파일만 · DB 쓰기 없음) — 몸통 g039-topics-fix.mjs applyFixes 그대로
//   river-national : verify.fixes add 3(무심천 · 광주천 · 화포천) → 86 → 89 · tags ["국가하천"](세트 꼴) · asOf 그대로
//   element        : verify.fixes variant-remove "Tin"(주석 element-050)
//   공통: version +1 · 적용한 fixes 에 applied "G042" · status verified 그대로(§9 — fixes ≤ 3)
//   전후 diff → data/pipeline/audit/g042-topics-diff.json
// 사용: node scripts/g042-topics-fix.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFixes } from './g039-topics-fix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const AUD = path.join(ROOT, 'data/pipeline/audit');
const APPLY = process.argv.includes('--apply');
const SETS = {
  'river-national': { extra: { tags: ['국가하천'] }, want: 89,
    note: ' · ★ G042: V040 fixes 3 add(무심천 · 광주천 · 2020-01 승격 ko.wikipedia · 화포천 2020 김해시 안내) → 89 = 공식 수(2024-02 환경부 보도 73→89) — 고시 원문은 못 봄(약한 근거 · V040 7절 ⑥)' },
  element: { extra: {}, want: 118, note: null },
};
const diff = {}; let bad = 0;
for (const [slug, cfg] of Object.entries(SETS)) {
  const f = path.join(DIR, `${slug}.json`);
  const t = JSON.parse(readFileSync(f, 'utf8'));
  const before = { count: t.items.length, status: t.status, version: t.version, asOf: t.asOf, variants: t.items.reduce((n, i) => n + i.variants.length, 0) };
  const vfix = (t.verify?.fixes ?? []).map((x) => ({ ...x, ...(x.op === 'add' ? cfg.extra : {}) }));
  const todo = vfix.filter((x) => !x.applied);
  if (!todo.length) { console.log(`${slug} — 적용할 fixes 없음(이미 됨)`); continue; }
  const r = applyFixes(t, todo, 'G042');
  t.verify.fixes.forEach((x, i) => { if (vfix[i].applied) x.applied = vfix[i].applied; });
  if (r.log.length) t.version += 1;
  if (cfg.note && r.log.length) t.source[0].note += cfg.note;
  const after = { count: t.items.length, status: t.status, version: t.version, asOf: t.asOf, variants: t.items.reduce((n, i) => n + i.variants.length, 0) };
  if (t.items.length !== cfg.want || t.count !== cfg.want) { console.error(`★ ${slug} count ${t.items.length}/${t.count} ≠ ${cfg.want}`); bad++; }
  if (t.status !== 'verified') { console.error(`★ ${slug} status ${t.status}`); bad++; }
  diff[slug] = { before, after, applied: r.log, skipped: r.skipped };
  console.log(`${slug.padEnd(16)} ${before.count} → ${after.count} · 변형 ${before.variants} → ${after.variants} · v${before.version} → v${after.version} · 적용 ${r.log.length} · 건너뜀 ${r.skipped.length} · ${after.status}`);
  for (const x of r.log) console.log('   ', JSON.stringify(x));
  for (const s of r.skipped) console.log('   건너뜀', JSON.stringify(s).slice(0, 160));
  if (APPLY && !bad) writeFileSync(f, JSON.stringify(t, null, 1) + '\n');
}
if (bad) process.exitCode = 1;
console.log(`[g042-topics-fix] ${APPLY && !bad ? '썼다' : '확인만(--apply)'}`);
if (APPLY && !bad && Object.keys(diff).length) writeFileSync(path.join(AUD, 'g042-topics-diff.json'), JSON.stringify({ round: 'G042', at: new Date().toISOString(), sets: diff }, null, 1) + '\n');
