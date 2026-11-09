#!/usr/bin/env node
// =============================================================================
// G046 — 주제 세트 변형 적용(V043 verify.fixes · CV-172 · CV-173 ② 구단·기업 영문 약칭 허용 · 18 §9 변형 규칙) — 파일만 · DB 쓰기 없음
//   대상: topics/*.json 의 verify.fixes 중 op 가 있고 applied 가 없는 것(round V043 · V044 가 있으면 그것도)
//   op: variant(add) · variant-remove(remove) · remove(항목 제거 — V044) · flag(liar/draw — V044)
//   add 건너뜀(목록에 남김): 제 name/변형과 정규화로 같음(죽은 변형) · 세트 안 다른 항목의 name/변형과 정규화로 겹침(topics-check 막힘)
//   적용한 fix 에 applied: "G046"(건너뛴 add 는 skipped: [{text, why}]) · 바뀐 세트 version +1 · count = items.length
//   status · name · 다른 칸은 안 바꾼다
//   전후 diff → data/pipeline/audit/g046-topics-diff.json
// 사용: node scripts/g046-topics-fix.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const ROUND = 'G046';
const C = (s) => flexCanon(String(s ?? ''));

const diff = { round: ROUND, sets: [], skipped: [], totals: { add: 0, remove: 0, itemRemove: 0, flag: 0, skipped: 0, latin: 0 } };
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const file = path.join(DIR, f);
  const t = JSON.parse(readFileSync(file, 'utf8'));
  const fixes = (t.verify?.fixes ?? []).filter((x) => x && typeof x === 'object' && x.op && !x.applied);
  if (!fixes.length) continue;
  const row = { topic: t.topic, add: 0, remove: 0, itemRemove: 0, flag: 0, skipped: 0, versionBefore: t.version, changes: [] };
  const byId = new Map(t.items.map((i) => [i.id, i]));
  for (const fx of fixes) {
    const it = byId.get(fx.id);
    if (!it) throw new Error(`${t.topic}: 항목 없음 ${fx.id}`);
    if (fx.op === 'variant') {
      const skipped = [];
      for (const s of fx.add ?? []) {
        const c = C(s);
        const own = new Set([it.name, ...it.variants].map(C));
        if (own.has(c)) { skipped.push({ text: s, why: '제 name/변형과 정규화로 같음(죽은 변형)' }); continue; }
        const other = t.items.find((o) => o.id !== it.id && [o.name, ...o.variants].some((x) => C(x) === c));
        if (other) { skipped.push({ text: s, why: `세트 안 ${other.id} ${other.name} 과 겹침` }); continue; }
        it.variants.push(s);
        row.add += 1;
        if (/[A-Za-z]/.test(s)) diff.totals.latin += 1;
        row.changes.push({ id: it.id, name: it.name, add: s });
      }
      if (skipped.length) { fx.skipped = skipped; row.skipped += skipped.length; for (const k of skipped) diff.skipped.push({ topic: t.topic, id: it.id, name: it.name, ...k }); }
    } else if (fx.op === 'variant-remove') {
      for (const s of fx.remove ?? []) {
        const n = it.variants.length;
        it.variants = it.variants.filter((v) => v !== s);
        if (it.variants.length === n) throw new Error(`${it.id}: 뺄 변형 없음 ${s}`);
        row.remove += 1;
        row.changes.push({ id: it.id, name: it.name, remove: s });
      }
    } else if (fx.op === 'remove') {
      t.items = t.items.filter((x) => x.id !== it.id);
      row.itemRemove += 1;
      row.changes.push({ id: it.id, name: it.name, itemRemove: true });
    } else if (fx.op === 'flag') {
      for (const k of ['liar', 'draw']) if (k in fx) it[k] = !!fx[k];
      row.flag += 1;
      row.changes.push({ id: it.id, name: it.name, flag: { liar: fx.liar, draw: fx.draw } });
    } else throw new Error(`${t.topic}: 모르는 op ${fx.op}`);
    fx.applied = ROUND;
  }
  t.count = t.items.length;
  t.liar = t.items.some((i) => i.liar);
  t.draw = t.items.some((i) => i.draw);
  t.verify.appliedRound = ROUND;
  t.version += 1;
  row.versionAfter = t.version;
  for (const k of ['add', 'remove', 'itemRemove', 'flag', 'skipped']) diff.totals[k] += row[k];
  diff.sets.push(row);
  if (APPLY) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
}
for (const r of diff.sets) console.log(r.topic.padEnd(22), `add ${r.add}`.padEnd(8), `remove ${r.remove}`.padEnd(10), r.itemRemove ? `항목 제거 ${r.itemRemove} ` : '', r.flag ? `플래그 ${r.flag} ` : '', r.skipped ? `건너뜀 ${r.skipped}` : '', `v${r.versionBefore}→${r.versionAfter}`);
for (const s of diff.skipped) console.log('  건너뜀', s.topic, s.id, s.name, '+', s.text, '—', s.why);
console.log(JSON.stringify(diff.totals));
if (APPLY) { writeFileSync(path.join(ROOT, 'data/pipeline/audit/g046-topics-diff.json'), JSON.stringify(diff, null, 1) + '\n'); console.log('적용 · audit/g046-topics-diff.json'); }
else console.log('dry-run (--apply 로 씀)');
