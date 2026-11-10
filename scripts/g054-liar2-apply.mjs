#!/usr/bin/env node
// =============================================================================
// G054 — 라이어 2차 V048 fixes 적용 + 기존 세트에 합치기(DG-092 · C126 · CV-181) — 파일만 · DB 쓰기 없음
//   ① liar-<주제>-2.json 15 의 verify.fixes 적용(g049 꼴): fool to 교체 · to null = 그 fool 만 뺌(2 미만이면 FOOL_FILL)
//      · remove 3 · dup 2 · diff · era · sub · variant(아래 VARIANT 표 — 문구가 제각각이라 손으로 옮김)
//   ② 적용한 항목을 liar-<주제>.json items 뒤에 붙임(id = 기존 최대 번호 다음부터 · 옛 id → 새 id 표 audit/g054-id-map.json)
//      기존 항목 글자 그대로 · 기존 verify 칸 그대로 · verify.history 에 V048 요약 한 줄 · count · version +1 · status verified
//   ③ pokemon-gen1 니드런♀ · 니드런♂ 변형(R090 ② ⓒ — 기호를 지우면 둘이 같아짐)
//   ④ 검사: 세트 안 이름 · 변형 유일성(flexCanon) · fool 이 자기 이름 · 변형과 같은 것 0 · fool 2~3
//   --apply 때만 씀 · -2 15 파일 삭제
// 사용: node scripts/g054-liar2-apply.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const ROUND = 'G054';
const C = (s) => flexCanon(String(s ?? ''));

// ── 변형 fix 8 — 손으로 옮긴 표(add · drop · rename) ────────────────────────
const VARIANT = {
  'liar-brand-2-021': { add: ['디플'], skip: [{ text: '디즈니+', why: 'GEN 판단 — 기호를 지우면 "디즈니" 가 되어 넓은 말(화성 · 작가를 뺀 V048 기준과 같게)' }] },
  'liar-job-2-010': { drop: ['작가'] },
  'liar-object-2-012': { drop: ['숫가락'] },
  'liar-place-2-004': { add: ['포차'] },
  'liar-place-2-031': { drop: ['화성'] },
  'liar-snack-2-030': { drop: ['떡볶기'] },
  'liar-sport-2-040': { rename: 'FC서울', add: ['서울 FC'], skip: [{ text: '서울', why: 'GEN 판단 — 도시 이름이라 넓은 말(수원화성 "화성" 을 뺀 V048 기준과 같게)' }] },
  'liar-vehicle-2-007': { drop: ['세그웨이'], add: ['전동 외발휠'] },
};
/** fool 이 2 미만이 된 항목에 GEN 이 써 넣을 것 — 실행해 보고 채움 */
const FOOL_FILL = {};
/** 니드런(R090 ② ⓒ) */
const NIDORAN = { 'pokemon-gen1-029': ['니드런 암컷', '니드런 암'], 'pokemon-gen1-032': ['니드런 수컷', '니드런 수'] };

const parseDiff = (fix) => { const m = String(fix).match(/([123])\s*$/); if (!m) throw new Error(`diff fix 꼴: ${fix}`); return Number(m[1]); };
const parseEra = (fix) => { const m = String(fix).match(/(classic|modern)\s*$/); if (!m) throw new Error(`era fix 꼴: ${fix}`); return m[1]; };

const report = { round: ROUND, sets: [], foolReplaced: [], foolDropped: [], foolFilled: [], removed: [], variants: [], diff: [], era: [], sub: [], nidoran: [], problems: [] };
const idMap = {};
const read = (f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
const parts = readdirSync(DIR).filter((f) => /^liar-.*-2\.json$/.test(f)).sort();
if (parts.length !== 15) throw new Error(`-2 파일 ${parts.length} (15 아님 — 이미 적용?)`);
const out = [];

for (const pf of parts) {
  const p = read(pf);
  const bf = pf.replace(/-2\.json$/, '.json');
  const b = read(bf);
  if (b.items.some((i) => /-2-\d+$/.test(i.id))) throw new Error(`${bf}: 이미 합쳐짐`);
  const byId = new Map(p.items.map((i) => [i.id, i]));
  const fixes = p.verify.fixes;
  const removeIds = new Set();
  const row = { topic: b.topic, base: b.items.length, part: p.items.length, fool: 0, foolDrop: 0, remove: 0, dup: 0, diff: 0, era: 0, sub: 0, variant: 0 };
  for (const fx of fixes) {
    const it = byId.get(fx.id);
    if (!it) throw new Error(`${pf}: 항목 없음 ${fx.id}`);
    if (it.name !== fx.name) throw new Error(`${fx.id}: 이름 다름 ${it.name} ≠ ${fx.name}`);
    if (fx.op === 'remove' || fx.op === 'dup') { removeIds.add(it.id); row[fx.op]++; report.removed.push({ id: it.id, name: it.name, op: fx.op, reason: fx.reason }); }
    else if (fx.op === 'fool') {
      for (const r of fx.replace) {
        const i = it.fool.indexOf(r.from);
        if (i < 0) throw new Error(`${it.id}: fool 에 ${r.from} 없음`);
        const to = r.to;
        const own = [it.name, ...it.variants].map(C);
        const ok = to && !own.includes(C(to)) && !it.fool.some((x, j) => j !== i && C(x) === C(to));
        if (ok) { it.fool[i] = to; row.fool++; report.foolReplaced.push({ id: it.id, name: it.name, from: r.from, to, verdict: r.verdict }); }
        else { it.fool.splice(i, 1); row.foolDrop++; report.foolDropped.push({ id: it.id, name: it.name, from: r.from, to: to ?? null, why: to ? '교체어가 겹침/자기 이름' : 'to null' }); }
      }
    } else if (fx.op === 'diff') { const v = parseDiff(fx.fix); report.diff.push({ id: it.id, name: it.name, from: it.diff, to: v }); it.diff = v; row.diff++; }
    else if (fx.op === 'era') { const v = parseEra(fx.fix); report.era.push({ id: it.id, name: it.name, from: it.era, to: v }); it.era = v; row.era++; }
    else if (fx.op === 'sub') {
      const v = String(fx.fix).trim(); report.sub.push({ id: it.id, name: it.name, from: it.sub, to: v });
      it.sub = v; if (Array.isArray(it.tags) && it.tags.length === 1) it.tags = [v]; row.sub++;
    } else if (fx.op === 'variant') {
      const v = VARIANT[it.id];
      if (!v) throw new Error(`${it.id}: VARIANT 표 없음 — ${fx.fix}`);
      const before = { name: it.name, variants: [...it.variants] };
      if (v.rename) { const old = it.name; it.name = v.rename; it.variants = it.variants.filter((x) => C(x) !== C(v.rename)); if (!it.variants.some((x) => C(x) === C(old))) it.variants.unshift(old); }
      for (const d of v.drop ?? []) { if (!it.variants.includes(d)) throw new Error(`${it.id}: 뺄 변형 ${d} 없음`); it.variants = it.variants.filter((x) => x !== d); }
      for (const a of v.add ?? []) if (!it.variants.some((x) => C(x) === C(a)) && C(a) !== C(it.name)) it.variants.push(a);
      report.variants.push({ id: it.id, before, after: { name: it.name, variants: [...it.variants] }, skip: v.skip ?? [] });
      row.variant++;
    } else throw new Error(`${it.id}: 모르는 op ${fx.op}`);
    fx.applied = ROUND;
  }
  const keep = p.items.filter((i) => !removeIds.has(i.id));
  // fool 2 미만
  for (const it of keep) if (it.fool.length < 2) {
    const add = FOOL_FILL[it.id];
    if (!add) report.problems.push(`${it.id} ${it.name} fool ${it.fool.length} — FOOL_FILL 필요`);
    else { it.fool.push(add); report.foolFilled.push({ id: it.id, name: it.name, add }); }
  }
  // 합치기
  let n = Math.max(...b.items.map((i) => Number(i.id.match(/-(\d+)$/)[1])));
  const pad = (x) => String(x).padStart(3, '0');
  for (const it of keep) {
    const nid = `${b.topic}-${pad(++n)}`;
    idMap[it.id] = nid;
    b.items.push({ ...it, id: nid });
  }
  // 검사
  const seen = new Map();
  for (const it of b.items) {
    for (const x of [it.name, ...(it.variants ?? [])]) {
      const c = C(x); const o = seen.get(c);
      if (o && o !== it.id) report.problems.push(`${b.topic}: "${x}" ${it.id} ↔ ${o}`);
      seen.set(c, it.id);
    }
  }
  for (const it of b.items) {
    const own = new Set([it.name, ...(it.variants ?? [])].map(C));
    if (it.fool.some((f) => own.has(C(f)))) report.problems.push(`${it.id} ${it.name}: fool 이 자기 이름/변형`);
    if (new Set(it.fool.map(C)).size !== it.fool.length) report.problems.push(`${it.id}: fool 겹침`);
    if (it.fool.length < 2 || it.fool.length > 3) report.problems.push(`${it.id}: fool ${it.fool.length}`);
  }
  const fa = p.verify.foolAudit;
  b.verify.history = [...(b.verify.history ?? []), {
    round: 'V048', appliedRound: ROUND, mergedFrom: `${p.topic}.json(createdRound ${p.createdRound} · web-desk/liar2 Sonnet 5.5)`,
    items: `${b.items.length - keep.length} + ${keep.length}(-2 ${p.items.length} − remove ${row.remove} − dup ${row.dup}) = ${b.items.length}`,
    summary: `${p.verify.why} · fool ${fa.fools}: ok ${fa.ok} · tooClose ${fa.tooClose} · tooFar ${fa.tooFar} · bad ${fa.bad} · 교체 ${row.fool} · 뺌 ${row.foolDrop}`,
    unsure: p.verify.unsure ?? [], fixes,
  }];
  b.count = b.items.length; b.version += 1; b.status = 'verified'; b.asOf = '2026-11-10';
  const src = (p.source ?? []).filter((s) => !(b.source ?? []).some((x) => x.url === s.url));
  b.source = [...(b.source ?? []), ...src];
  row.after = b.items.length; row.version = b.version;
  report.sets.push(row);
  out.push({ bf, b, pf });
}

// 니드런
const pk = read('pokemon-gen1.json');
for (const [id, list] of Object.entries(NIDORAN)) {
  const it = pk.items.find((x) => x.id === id);
  const before = [...it.variants];
  for (const v of list) {
    const c = C(v);
    const o = pk.items.find((x) => x.id !== id && [x.name, ...x.variants].some((y) => C(y) === c));
    if (o) { report.problems.push(`니드런 변형 ${v} ↔ ${o.id}`); continue; }
    if (![it.name, ...it.variants].some((y) => C(y) === c)) it.variants.push(v);
  }
  report.nidoran.push({ id, name: it.name, before, after: [...it.variants] });
}
pk.version += 1;

for (const r of report.sets) console.log(r.topic.padEnd(16), `${r.base}+${r.part}→${r.after}`, `v${r.version}`, Object.entries(r).filter(([k, v]) => typeof v === 'number' && v && !['base', 'part', 'after', 'version'].includes(k)).map(([k, v]) => `${k} ${v}`).join(' · '));
const tot = report.sets.reduce((a, r) => a + r.after, 0);
console.log(`합 ${tot} · fool 교체 ${report.foolReplaced.length} · 뺌 ${report.foolDropped.length} · 채움 ${report.foolFilled.length} · remove+dup ${report.removed.length} · diff ${report.diff.length} · era ${report.era.length} · sub ${report.sub.length} · 변형 ${report.variants.length}`);
for (const n of report.nidoran) console.log('니드런', n.name, JSON.stringify(n.before), '→', JSON.stringify(n.after));
for (const d of report.foolDropped) console.log("fool 뺌", JSON.stringify(d));
console.log('문제', report.problems.length); for (const x of report.problems) console.log('  ★', x);
if (report.problems.length) process.exit(1);
if (APPLY) {
  for (const { bf, b, pf } of out) { writeFileSync(path.join(DIR, bf), JSON.stringify(b, null, 1) + '\n'); unlinkSync(path.join(DIR, pf)); }
  writeFileSync(path.join(DIR, 'pokemon-gen1.json'), JSON.stringify(pk, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g054-id-map.json'), JSON.stringify(idMap, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g054-liar2-apply.json'), JSON.stringify(report, null, 1) + '\n');
  console.log('적용 · -2 15 삭제 · audit/g054-id-map.json · audit/g054-liar2-apply.json');
} else console.log('dry-run (--apply 로 씀)');
