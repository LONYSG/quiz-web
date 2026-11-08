#!/usr/bin/env node
// =============================================================================
// G039 — 주제 세트 fixes 기계 적용(V039 verify.fixes · CV-164) + 설계 결정(CV-165) — 파일만 · DB 쓰기 없음
//   op: add(id = 세트 마지막 번호 + 1 · 지운 번호 재사용 안 함) · remove · rename(name → to · 옛 name 은 variants)
//       · variant(변형 더함) · variant-remove · label(화면 이름) · set(liar/draw 등 항목 칸)
//   대상 항목: id 또는 name(정규화 일치)
//   세트 머리: count = items.length · version +1 · asOf(고시 세트만 고시일) · 적용한 fixes 에 applied: "G039"
//   status: --verify-sets 에 든 세트는 verified · verify.verdict verified · verify.appliedRound G039
//   needs 가 있는 fix(국가하천 '별표 확인')는 --needs-ok <slug> 를 줄 때만 적용
//   전후 diff → data/pipeline/audit/g039-topics-diff.json
// 사용: node scripts/g039-topics-fix.mjs [--apply] [--only slug,slug]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const AUD = path.join(ROOT, 'data/pipeline/audit');
const a = process.argv.slice(2);
const APPLY = a.includes('--apply');
const ONLY = a.includes('--only') ? a[a.indexOf('--only') + 1].split(',') : null;
const C = (s) => flexCanon(String(s ?? ''));

/** 설계 결정(CV-165) · G039 확인 결과 — V039 fixes 와 같은 꼴 */
export const DESIGN = JSON.parse(readFileSync(path.join(AUD, 'g039-raw/design-fixes.json'), 'utf8'));

export function applyFixes(t, fixes, tag = 'G039') {
  const log = []; const skipped = [];
  const find = (f) => t.items.find((i) => (f.id && i.id === f.id) || (!f.id && f.name && (C(i.name) === C(f.name) || i.variants.some((v) => C(v) === C(f.name)))));
  let seq = Math.max(0, ...t.items.map((i) => Number(i.id.split('-').at(-1))));
  const defaults = { draw: mode(t.items.map((i) => i.draw)), liar: mode(t.items.map((i) => i.liar)) };
  for (const f of fixes) {
    if (f.skip) { skipped.push({ ...f, why: f.skip }); continue; }
    const it = f.op === 'add' ? null : find(f);
    if (f.op !== 'add' && !it) { skipped.push({ ...f, why: '대상 항목 없음' }); continue; }
    if (f.op === 'add') {
      if (t.items.some((i) => C(i.name) === C(f.name))) { skipped.push({ ...f, why: '이미 있음' }); continue; }
      seq += 1; const id = `${t.topic}-${String(seq).padStart(3, '0')}`;
      const n = { id, name: f.name, ...(f.label ? { label: f.label } : {}), variants: f.variants ?? [], tags: f.tags ?? [], ...(f.year ? { year: f.year } : {}), draw: f.draw ?? defaults.draw, liar: f.liar ?? defaults.liar, qid: null };
      t.items.push(n); log.push({ op: 'add', id, name: f.name });
    } else if (f.op === 'remove') { t.items.splice(t.items.indexOf(it), 1); log.push({ op: 'remove', id: it.id, name: it.name }); }
    else if (f.op === 'rename') { const old = it.name; it.name = f.to; it.variants = [old, ...it.variants.filter((v) => C(v) !== C(f.to) && C(v) !== C(old))]; log.push({ op: 'rename', id: it.id, from: old, to: f.to }); }
    else if (f.op === 'variant') { const add = (f.variants ?? []).filter((v) => C(v) !== C(it.name) && !it.variants.some((x) => C(x) === C(v))); it.variants.push(...add); log.push({ op: 'variant', id: it.id, add }); }
    else if (f.op === 'variant-remove') { const rm = new Set((f.variants ?? []).map(C)); const before = it.variants.length; it.variants = it.variants.filter((v) => !rm.has(C(v)) && !(f.match && new RegExp(f.match).test(v))); log.push({ op: 'variant-remove', id: it.id, n: before - it.variants.length }); }
    else if (f.op === 'label') { it.label = f.label; log.push({ op: 'label', id: it.id, label: f.label }); }
    else if (f.op === 'set') { for (const [k, v] of Object.entries(f.set)) it[k] = v; log.push({ op: 'set', id: it.id, set: f.set }); }
    else { skipped.push({ ...f, why: `모르는 op ${f.op}` }); continue; }
    f.applied = tag;
  }
  t.count = t.items.length;
  return { log, skipped };
}
const mode = (xs) => { const c = new Map(); for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1); return [...c].sort((p, q) => q[1] - p[1])[0]?.[0] ?? false; };

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/g039-topics-fix.mjs')) {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  const diff = {}; let total = { applied: 0, skipped: 0 };
  for (const f of files) {
    const slug = f.replace('.json', ''); if (ONLY && !ONLY.includes(slug)) continue;
    const t = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
    const d = DESIGN.sets[slug] ?? {};
    const vfix = (t.verify?.fixes ?? []).map((x) => ({ ...x }));
    for (const x of vfix) { const ov = d.override?.[JSON.stringify([x.op, x.id ?? x.name])]; if (ov) Object.assign(x, ov); }
    const fixes = [...vfix.filter((x) => !x.applied), ...(d.fixes ?? [])];
    if (!fixes.length && !d.head) continue;
    const before = { count: t.items.length, status: t.status, version: t.version, asOf: t.asOf };
    const r = applyFixes(t, fixes);
    // V039 fixes 의 applied 표시를 원본 verify.fixes 에 옮긴다(지우지 않는다)
    (t.verify?.fixes ?? []).forEach((x, i) => { if (vfix[i].applied) x.applied = vfix[i].applied; else if (vfix[i].skip) x.skipped = `G039 — ${vfix[i].skip}`; });
    if (d.head) Object.assign(t, d.head);
    if (r.log.length || d.head) t.version += 1;
    if (d.asOf) t.asOf = d.asOf;
    if (d.status === 'verified') { t.status = 'verified'; t.verify.verdict = 'verified'; t.verify.appliedRound = 'G039'; }
    if (d.verifyNote) t.verify.note = d.verifyNote;
    diff[slug] = { before, after: { count: t.items.length, status: t.status, version: t.version, asOf: t.asOf }, applied: r.log, skipped: r.skipped };
    total.applied += r.log.length; total.skipped += r.skipped.length;
    console.log(`${slug.padEnd(24)} ${before.count} → ${t.items.length} · 적용 ${r.log.length} · 건너뜀 ${r.skipped.length} · ${before.status} → ${t.status}`);
    for (const s of r.skipped) console.log('   건너뜀', JSON.stringify(s).slice(0, 160));
    if (APPLY) writeFileSync(path.join(DIR, f), JSON.stringify(t, null, 1) + '\n');
  }
  console.log(`[g039-topics-fix] ${APPLY ? '썼다' : '확인만(--apply)'} · 적용 ${total.applied} · 건너뜀 ${total.skipped}`);
  if (APPLY) writeFileSync(path.join(AUD, 'g039-topics-diff.json'), JSON.stringify({ round: 'G039', at: new Date().toISOString(), sets: diff }, null, 1) + '\n');
}
