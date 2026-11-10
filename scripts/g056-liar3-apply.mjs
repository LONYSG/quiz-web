#!/usr/bin/env node
// =============================================================================
// G056 — 라이어 새 주제 4 V049 fixes 적용(DG-094 · C129 · CV-183) — 파일만 · DB 쓰기 없음
//   holiday · school · drinking · cafe 의 verify.fixes 전부 적용(g054 꼴 — 다시 판정하지 않음):
//     fool to 교체 · to null(또는 교체어가 겹침/자기 이름) = 그 fool 만 뺌(2 미만이면 FOOL_FILL) · diff · sub · variant(아래 표)
//   unsure 는 전부 유지(20 §19) · fx.applied = G056 · version +1 · status verified
//   liar-streetfood.json 삭제(찬종 2026-11-10 "주제를 버림" — 보충하지 않음)
//   검사: 세트 안 이름 · 변형 유일성(flexCanon) · fool 이 자기 이름 · 변형과 같은 것 0 · fool 2~3
// 사용: node scripts/g056-liar3-apply.mjs [--apply]   (멱등 — 이미 적용된 fixes 는 건너뜀)
// =============================================================================
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const ROUND = 'G056';
const SETS = ['liar-holiday', 'liar-school', 'liar-drinking', 'liar-cafe'];
const DROP_FILE = 'liar-streetfood.json';
const C = (s) => flexCanon(String(s ?? ''));

const VARIANT = {
  'liar-school-020': { drop: ['실내화 주머니'] },
  'liar-drinking-030': { drop: ['먹태깡'] },
};
/** fool 이 2 미만이 된 항목에 GEN 이 써 넣을 것 — 실행해 보고 채움 */
const FOOL_FILL = {};

const parseDiff = (fix) => { const m = String(fix).match(/^\s*[123]\s*→\s*([123])/); if (!m) throw new Error(`diff fix 꼴: ${fix}`); return Number(m[1]); };
const parseSub = (fix) => { const m = String(fix).match(/→\s*([^(]+?)\s*(\(|$)/); if (!m) throw new Error(`sub fix 꼴: ${fix}`); return m[1].trim(); };

const report = { round: ROUND, sets: [], foolReplaced: [], foolDropped: [], foolFilled: [], variants: [], diff: [], sub: [], streetfoodDeleted: false, problems: [] };
const out = [];

for (const topic of SETS) {
  const f = `${topic}.json`;
  const b = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
  const byId = new Map(b.items.map((i) => [i.id, i]));
  const row = { topic, items: b.items.length, fixes: b.verify.fixes.length, fool: 0, foolDrop: 0, diff: 0, sub: 0, variant: 0, skipped: 0 };
  for (const fx of b.verify.fixes) {
    if (fx.applied) { row.skipped++; continue; }
    const it = byId.get(fx.id);
    if (!it) throw new Error(`${f}: 항목 없음 ${fx.id}`);
    if (it.name !== fx.name) throw new Error(`${fx.id}: 이름 다름 ${it.name} ≠ ${fx.name}`);
    if (fx.op === 'fool') {
      for (const r of fx.replace) {
        const i = it.fool.indexOf(r.from);
        if (i < 0) throw new Error(`${it.id}: fool 에 ${r.from} 없음`);
        const own = [it.name, ...it.variants].map(C);
        const ok = r.to && !own.includes(C(r.to)) && !it.fool.some((x, j) => j !== i && C(x) === C(r.to));
        if (ok) { it.fool[i] = r.to; row.fool++; report.foolReplaced.push({ id: it.id, name: it.name, from: r.from, to: r.to, verdict: r.verdict }); }
        else { it.fool.splice(i, 1); row.foolDrop++; report.foolDropped.push({ id: it.id, name: it.name, from: r.from, to: r.to ?? null, why: r.to ? '교체어가 겹침/자기 이름' : 'to null' }); }
      }
    } else if (fx.op === 'diff') { const v = parseDiff(fx.fix); report.diff.push({ id: it.id, name: it.name, from: it.diff, to: v }); it.diff = v; row.diff++; }
    else if (fx.op === 'sub') {
      const v = parseSub(fx.fix); report.sub.push({ id: it.id, name: it.name, from: it.sub, to: v });
      it.sub = v; if (Array.isArray(it.tags) && it.tags.length === 1) it.tags = [v]; row.sub++;
    } else if (fx.op === 'variant') {
      const v = VARIANT[it.id];
      if (!v) throw new Error(`${it.id}: VARIANT 표 없음 — ${fx.fix}`);
      const before = [...it.variants];
      for (const d of v.drop ?? []) { if (!it.variants.includes(d)) throw new Error(`${it.id}: 뺄 변형 ${d} 없음`); it.variants = it.variants.filter((x) => x !== d); }
      report.variants.push({ id: it.id, name: it.name, before, after: [...it.variants] });
      row.variant++;
    } else throw new Error(`${it.id}: 모르는 op ${fx.op}`);
    fx.applied = ROUND;
  }
  for (const it of b.items) if (it.fool.length < 2) {
    const add = FOOL_FILL[it.id];
    if (!add) report.problems.push(`${it.id} ${it.name} fool ${it.fool.length} — FOOL_FILL 필요`);
    else { it.fool.push(add); report.foolFilled.push({ id: it.id, name: it.name, add }); }
  }
  // 검사
  const seen = new Map();
  for (const it of b.items) for (const x of [it.name, ...(it.variants ?? [])]) {
    const c = C(x); const o = seen.get(c);
    if (o && o !== it.id) report.problems.push(`${topic}: "${x}" ${it.id} ↔ ${o}`);
    seen.set(c, it.id);
  }
  for (const it of b.items) {
    const own = new Set([it.name, ...(it.variants ?? [])].map(C));
    if (it.fool.some((x) => own.has(C(x)))) report.problems.push(`${it.id} ${it.name}: fool 이 자기 이름/변형`);
    if (new Set(it.fool.map(C)).size !== it.fool.length) report.problems.push(`${it.id}: fool 겹침`);
    if (it.fool.length < 2 || it.fool.length > 3) report.problems.push(`${it.id}: fool ${it.fool.length}`);
  }
  if (row.skipped < row.fixes) {
    b.verify.appliedRound = ROUND;
    b.version += 1; b.status = 'verified'; b.asOf = '2026-11-10';
  }
  b.count = b.items.length;
  row.version = b.version; row.status = b.status;
  report.sets.push(row);
  out.push({ f, b });
}

const sf = path.join(DIR, DROP_FILE);
report.streetfoodDeleted = !existsSync(sf) ? 'already' : APPLY;

for (const r of report.sets) console.log(r.topic.padEnd(14), `항목 ${r.items}`, `v${r.version}`, r.status, `fixes ${r.fixes}`, `fool ${r.fool} · 뺌 ${r.foolDrop} · diff ${r.diff} · sub ${r.sub} · 변형 ${r.variant}${r.skipped ? ` · 이미 ${r.skipped}` : ''}`);
console.log(`합 ${report.sets.reduce((a, r) => a + r.items, 0)} · fool 교체 ${report.foolReplaced.length} · 뺌 ${report.foolDropped.length} · 채움 ${report.foolFilled.length} · diff ${report.diff.length} · sub ${report.sub.length} · 변형 ${report.variants.length}`);
for (const d of report.foolDropped) console.log('fool 뺌', JSON.stringify(d));
for (const v of report.variants) console.log('변형', v.name, JSON.stringify(v.before), '→', JSON.stringify(v.after));
for (const s of report.sub) console.log('sub', s.name, s.from, '→', s.to);
console.log('문제', report.problems.length); for (const x of report.problems) console.log('  ★', x);
if (report.problems.length) process.exit(1);
if (APPLY) {
  for (const { f, b } of out) writeFileSync(path.join(DIR, f), JSON.stringify(b, null, 1) + '\n');
  if (existsSync(sf)) unlinkSync(sf);
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g056-liar3-apply.json'), JSON.stringify(report, null, 1) + '\n');
  console.log('적용 · liar-streetfood.json 삭제 · audit/g056-liar3-apply.json');
} else console.log('dry-run (--apply 로 씀)');
