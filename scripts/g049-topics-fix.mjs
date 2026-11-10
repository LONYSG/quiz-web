#!/usr/bin/env node
// =============================================================================
// G049 — 제시어 세트 fixes 적용(V044 라이어 15 · V045 캐치 10 · CV-174 · CV-176 · 18 §12) — 파일만 · DB 쓰기 없음
//   라이어: fool replace(to 있으면 교체 · null 이면 그 fool 만 뺌 — 2 미만이면 FOOL_FILL) · remove · diff · era · sub · variant
//           + 찬종 결정(2026-11-10): unsure 인물 유지 · fool "이경규" 교체(LIAR_FOOL_EXTRA)
//   캐치: ★ remove(dup 아님) 239 는 적용하지 않음(찬종 2026-11-10 — 18 §12 캐치 단어 기준 개정)
//           → 낯선 단어(STRANGE)만 remove · 나머지 applied "kept" · 사유가 추상·장면 갈림·알아보기 어려움 꼴이면 diff 3
//         remove dup 63 → 같은 뜻(DUP_MERGE)만 대표의 변형으로 합침 · 뜻이 다른 하위 종목·다른 사물은 둘 다 유지(applied "kept")
//         diff · variant · sub 그대로(variant 는 제시어 가족(liar-* / draw-*) 안 유일성 검사 — 걸리면 건너뜀 · 목록)
//   fix 에 applied "G049"(또는 "kept") · verify.appliedRound · version +1 · count · status verified
//   전후 diff → data/pipeline/audit/g049-topics-diff.json
// 사용: node scripts/g049-topics-fix.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const ROUND = 'G049';
const KEPT_BY = '찬종 2026-11-10';
const C = (s) => flexCanon(String(s ?? ''));

// ── GEN 판단 표 ─────────────────────────────────────────────────────────────
/** 캐치 remove 239 중 "20~50대 한국인이 정답을 듣고도 모를 낯선 말"만 뺀다 · 같은 뜻 항목이 있으면 그 변형으로 */
const STRANGE = {
  'draw-proverb-122': { why: '정저지와 — 사자성어로는 거의 안 쓰임(우물 안 개구리로 앎)', variantTo: '우물 안 개구리' },
  'draw-proverb-133': { why: '누란지위 — 일반인이 모르는 사자성어' },
  'draw-object-250': { why: '지남철 — 자석의 옛말 · 20~30대가 모름', variantTo: '자석' },
};
/** 그림 중복 63 중 같은 뜻(동의어)만 합침 — 지운 이름 → 대표 name */
const DUP_MERGE = { 무용: '댄스', 헤엄: '수영', 뽀뽀: '키스', 삿대질: '손가락질', 연주회: '콘서트', 씨름판: '씨름', 장터: '시장', 교도소: '감옥', 모래사장: '해변' };
/** 유지한 remove 의 사유가 이 꼴이면 diff 3(추상 · 장면 갈림 · 한 장면으로 어려움 · 알아보기 어려움) — 상하위어 · 가까운 그림 꼴은 그대로 */
const DIFF3 = /추상|갈림|알아볼|알아보기|그림 불가|그릴 수 없|한 장면|하나로 안|소리|표정|증상|체감|모호|안 그려|시각 특징 없|보편성|모름|너무 작|불분명|장면 없|특징 약|대상이/;
/** 라이어 — 찬종 결정 fool 교체(이경규) */
const LIAR_FOOL_EXTRA = { 'liar-celebrity-024': [{ from: '이경규', to: '신동엽', why: '찬종 2026-11-10 — fool 쪽 이경규 교체(같은 sub 예능인)' }] };
/** fool 이 2 미만이 된 항목에 GEN 이 써 넣을 것(18 §12) — 실행해 보고 채움 */
const FOOL_FILL = {};

// ── 파싱 ────────────────────────────────────────────────────────────────────
function parseVariant(fix, name) {
  let s = String(fix).trim();
  let rename = null;
  const m = s.match(/^name\s+(.+?)\s*·\s*variants\s+(.+)$/);
  if (m) { rename = m[1].trim(); s = m[2]; }
  s = s.replace(/^variants\s*\+\s*/, '').replace(/^변형\s*/, '');
  const b = s.match(/\[(.*)\]/);
  if (b) s = b[1];
  const list = s.split(';').map((x) => x.trim()).filter(Boolean);
  return { rename, list: list.filter((x) => C(x) !== C(rename ?? name)) };
}
const parseDiff = (fix) => { const m = String(fix).match(/([123])\s*$/); if (!m) throw new Error(`diff fix 꼴: ${fix}`); return Number(m[1]); };
const parseEra = (fix) => { const m = String(fix).match(/→\s*(classic|modern)/); if (!m) throw new Error(`era fix 꼴: ${fix}`); return m[1]; };
const parseSub = (fix) => { const m = String(fix).match(/→\s*([^(]+)/); return (m ? m[1] : String(fix)).trim(); };

// ── 가족별 적용 ─────────────────────────────────────────────────────────────
const diff = { round: ROUND, liar: { sets: [] }, draw: { sets: [], strange: [], merged: [], dupKept: [], kept: 0, diff3: [] }, skipped: [], foolDropped: [], foolFilled: [], foolExtra: [], noop: [] };

function family(prefix) {
  const files = readdirSync(DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  return files.map((f) => ({ file: path.join(DIR, f), t: JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) }));
}
/** 가족 안 정규화 → 항목 (name · 변형) */
function ownerOf(sets, c, exceptId) {
  for (const { t } of sets) for (const it of t.items) if (it.id !== exceptId && [it.name, ...(it.variants ?? [])].some((x) => C(x) === c)) return it;
  return null;
}
function addVariants(sets, it, list, topic) {
  const added = []; const skipped = [];
  for (const v of list) {
    const c = C(v);
    if ([it.name, ...it.variants].some((x) => C(x) === c)) { skipped.push({ text: v, why: '이미 있음 · 죽은 변형' }); continue; }
    const o = ownerOf(sets, c, it.id);
    if (o) { skipped.push({ text: v, why: `${o.id} ${o.name} 과 겹침` }); continue; }
    it.variants.push(v); added.push(v);
  }
  for (const k of skipped) diff.skipped.push({ topic, id: it.id, name: it.name, ...k });
  return { added, skipped };
}

for (const kind of ['liar', 'draw']) {
  const sets = family(kind + '-');
  const all = new Map(); for (const s of sets) for (const it of s.t.items) all.set(it.id, { it, s });
  for (const s of sets) {
    const { t } = s;
    const fixes = (t.verify?.fixes ?? []).filter((x) => x && x.op && !x.applied);
    const row = { topic: t.topic, before: t.items.length, versionBefore: t.version, remove: 0, merged: 0, kept: 0, diff: 0, diff3: 0, era: 0, sub: 0, variant: 0, variantSkip: 0, rename: 0, foolReplace: 0, foolDrop: 0, foolFill: 0 };
    const diffBefore = [1, 2, 3].map((d) => t.items.filter((i) => i.diff === d).length);
    const byId = new Map(t.items.map((i) => [i.id, i]));
    const removeIds = new Set();
    const order = ['remove', 'variant', 'fool', 'diff', 'era', 'sub'];
    fixes.sort((a, b) => order.indexOf(a.op) - order.indexOf(b.op));
    for (const fx of fixes) {
      const it = byId.get(fx.id);
      if (!it) throw new Error(`${t.topic}: 항목 없음 ${fx.id}`);
      if (it.name !== fx.name && !it.variants.includes(fx.name)) throw new Error(`${fx.id}: 이름 다름 ${it.name} ≠ ${fx.name}`);
      if (fx.op === 'remove') {
        if (kind === 'liar') { removeIds.add(it.id); row.remove++; fx.applied = ROUND; continue; }
        if (fx.dup) {
          const repName = DUP_MERGE[it.name];
          if (repName) {
            const rep = sets.flatMap((x) => x.t.items).find((x) => x.name === repName);
            if (!rep) throw new Error(`대표 없음 ${repName}`);
            removeIds.add(it.id);
            if (!rep.variants.some((x) => C(x) === C(it.name))) rep.variants.push(it.name);
            row.merged++; fx.applied = ROUND; fx.mergedInto = rep.id;
            diff.draw.merged.push({ from: `${it.id} ${it.name}`, into: `${rep.id} ${rep.name}` });
          } else {
            row.kept++; fx.applied = 'kept'; fx.keptBy = 'GEN G049 — 뜻이 다른 하위 종목 · 다른 사물(둘 다 유지 · 18 §12)';
            diff.draw.dupKept.push(`${it.name}(${fx.reason.split(/[과와]/)[0]})`);
          }
          continue;
        }
        const st = STRANGE[it.id];
        if (st) {
          removeIds.add(it.id); row.remove++; fx.applied = ROUND; fx.strange = st.why;
          if (st.variantTo) {
            const rep = sets.flatMap((x) => x.t.items).find((x) => x.name === st.variantTo);
            if (!rep) throw new Error(`대표 없음 ${st.variantTo}`);
            if (!rep.variants.some((x) => C(x) === C(it.name))) rep.variants.push(it.name);
            fx.mergedInto = rep.id;
          }
          diff.draw.strange.push({ id: it.id, name: it.name, why: st.why, variantTo: st.variantTo ?? null });
          continue;
        }
        fx.applied = 'kept'; fx.keptBy = KEPT_BY; row.kept++;
        if (DIFF3.test(fx.reason ?? '') && it.diff !== 3) { diff.draw.diff3.push({ id: it.id, name: it.name, from: it.diff, reason: fx.reason }); it.diff = 3; row.diff3++; }
        continue;
      }
      if (fx.op === 'variant') {
        const { rename, list } = parseVariant(fx.fix, it.name);
        if (rename && rename !== it.name) {
          const old = it.name; it.name = rename; it.variants = it.variants.filter((x) => C(x) !== C(rename));
          if (!it.variants.some((x) => C(x) === C(old))) it.variants.unshift(old);
          row.rename++;
        }
        const { added, skipped } = addVariants(sets, it, list, t.topic);
        row.variant += added.length; row.variantSkip += skipped.length;
        if (skipped.length) fx.skipped = skipped;
        fx.applied = ROUND; continue;
      }
      if (fx.op === 'fool') {
        for (const r of fx.replace) {
          const i = it.fool.indexOf(r.from);
          if (i < 0) throw new Error(`${it.id}: fool 에 ${r.from} 없음`);
          const to = r.to;
          const ok = to && C(to) !== C(it.name) && !it.fool.some((x, j) => j !== i && C(x) === C(to));
          if (ok) { it.fool[i] = to; row.foolReplace++; }
          else { it.fool.splice(i, 1); row.foolDrop++; diff.foolDropped.push({ id: it.id, name: it.name, from: r.from, to: to ?? null, why: to ? '교체어가 겹침/자기 이름' : 'to null' }); }
        }
        fx.applied = ROUND; continue;
      }
      if (fx.op === 'diff') { const v = parseDiff(fx.fix); it.diff = kind === 'draw' && diff.draw.diff3.some((x) => x.id === it.id) ? Math.max(v, it.diff) : v; row.diff++; fx.applied = ROUND; continue; }
      if (fx.op === 'era') { it.era = parseEra(fx.fix); row.era++; fx.applied = ROUND; continue; }
      if (fx.op === 'sub') {
        const v = parseSub(fx.fix);
        if (v === it.sub) diff.noop.push({ id: it.id, name: it.name, op: 'sub', fix: fx.fix, why: '현재 값과 같음' });
        else { it.sub = v; if (Array.isArray(it.tags) && it.tags.length === 1) it.tags = [v]; row.sub++; }
        fx.applied = ROUND; continue;
      }
      throw new Error(`${t.topic}: 모르는 op ${fx.op}`);
    }
    if (kind === 'liar') {
      for (const it of t.items) {
        for (const ex of LIAR_FOOL_EXTRA[it.id] ?? []) {
          const i = it.fool.indexOf(ex.from); if (i < 0) throw new Error(`${it.id}: extra fool ${ex.from} 없음`);
          it.fool[i] = ex.to; diff.foolExtra.push({ id: it.id, name: it.name, ...ex });
        }
        if (it.fool.length < 2) {
          const add = FOOL_FILL[it.id];
          if (!add) { diff.foolFilled.push({ id: it.id, name: it.name, sub: it.sub, fool: [...it.fool], need: true }); continue; }
          it.fool.push(add); row.foolFill++; diff.foolFilled.push({ id: it.id, name: it.name, sub: it.sub, add });
        }
      }
    }
    t.items = t.items.filter((i) => !removeIds.has(i.id));
    t.count = t.items.length;
    t.status = 'verified';
    t.verify.appliedRound = ROUND;
    if (kind === 'draw') t.verify.keptByDesign = row.kept;
    t.version += 1;
    row.after = t.items.length; row.versionAfter = t.version;
    row.diffBefore = diffBefore; row.diffAfter = [1, 2, 3].map((d) => t.items.filter((i) => i.diff === d).length);
    diff[kind].sets.push(row);
  }
  if (APPLY) for (const { file, t } of sets) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
}

for (const k of ['liar', 'draw']) {
  console.log(`── ${k}`);
  for (const r of diff[k].sets) console.log(r.topic.padEnd(18), `${r.before}→${r.after}`, Object.entries(r).filter(([kk, v]) => typeof v === 'number' && v && !['before', 'after', 'versionBefore', 'versionAfter'].includes(kk)).map(([kk, v]) => `${kk} ${v}`).join(' · '), `diff ${r.diffBefore.join('/')}→${r.diffAfter.join('/')}`);
}
const need = diff.foolFilled.filter((x) => x.need);
console.log('fool 뺌', diff.foolDropped.length, '· fool 채울 것', need.length, need.map((x) => `${x.id} ${x.name}(${x.sub}) ${x.fool}`).join(' | '));
console.log('변형 건너뜀', diff.skipped.length); for (const s of diff.skipped) console.log('  ', s.topic, s.name, '+', s.text, '—', s.why);
console.log('낯선 단어 뺌', diff.draw.strange.map((x) => x.name).join(' · '), '· 합침', diff.draw.merged.length, '· 그림중복 유지', diff.draw.dupKept.length, '· diff3', diff.draw.diff3.length);
console.log('no-op', JSON.stringify(diff.noop));
if (need.length) { console.log('★ FOOL_FILL 필요 — 쓰지 않음'); process.exit(1); }
if (APPLY) { writeFileSync(path.join(ROOT, 'data/pipeline/audit/g049-topics-diff.json'), JSON.stringify(diff, null, 1) + '\n'); console.log('적용 · audit/g049-topics-diff.json'); }
else console.log('dry-run (--apply 로 씀)');
