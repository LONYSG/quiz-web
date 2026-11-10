#!/usr/bin/env node
// =============================================================================
// G055 — 라이어 새 주제 5(web-desk/liar3 · 찬종의 웹 Claude Sonnet 5.5 · 누구나 5 주제 184 · fool 3) — 파일만 · DB 쓰기 없음
//   → liar-<주제>.json 새 파일 5(candidate · optIn 없음 = 기본 주제 · group 없음 · id liar-<주제>-NNN)
//   찬종 2026-11-10: "라이어 키워드는 보편성" — 팬 주제 11 · 약한 주제 4 는 넣지 않음(_merged 에 5 주제만)
//   GEN 재독(fool 거리 판정은 V049 몫 — 안 함):
//     뺌 = 낯선 단어 · 같은 세트 안 사실상 같은 것 · 주제와 상관없는 것(DROP) · 한 글자(자동)
//     fool 바꿈 = 낯선 이름(FOOL_FIX) · fool 이 자기 name·변형과 같으면 뺌(자동 — 2 미만이면 막힘)
//     var: 같은 항목 안 겹침 · 쓰레기 글자(VAR_DROP) · 특수문자 · 같은 세트의 다른 name·변형과 겹치면 뺌(자동)
//     다른 주제(기존 15 · 새 5)와 같은 단어 = 유지(18 §12 ⓔ) — 목록만 남김
//   산출: topics/liar-{holiday,school,drinking,cafe,streetfood}.json · audit/g055-liar3.json
// 사용: node scripts/g055-liar3.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const C = (s) => flexCanon(String(s ?? ''));
const merged = JSON.parse(readFileSync(path.join(ROOT, 'web-desk/liar3/_merged.json'), 'utf8'));

const META = {
  'liar-holiday': { nameKo: '명절', tags: ['라이어', '명절'] },
  'liar-school': { nameKo: '학창 시절', tags: ['라이어', '학창 시절'] },
  'liar-drinking': { nameKo: '술자리', tags: ['라이어', '술자리'] },
  'liar-cafe': { nameKo: '카페 메뉴', tags: ['라이어', '카페 메뉴'] },
  'liar-streetfood': { nameKo: '길거리 간식', tags: ['라이어', '길거리 간식'] },
};

/** 뺄 항목(주제:이름 → 사유) */
const DROP = {
  'liar-holiday:설거지': '주제와 상관없음(명절만의 것이 아님 — 브리핑 예)',
  'liar-school:자습': '같은 세트 안 사실상 같은 것 — 야간자율학습(야자)과 하나만',
  'liar-drinking:폭탄주': '같은 세트 안 사실상 같은 것 — 소맥(변형 "소맥" 이 소맥 항목과 겹침 · 소맥 하나만)',
};
/** fool 바꿈(주제:이름 → {옛: 새}) — 같은 sub 의 아는 단어 */
const FOOL_FIX = {
  'liar-holiday:벌초': { 예초: '제사' }, // 낯선 말(예초기는 알아도 '예초' 는 낯섦)
  'liar-holiday:산적': { 너비아니: '동그랑땡' }, // 20~30대에 낯섦
  'liar-holiday:유과': { 다식: '곶감' }, // 20~30대에 낯섦
};
/** 뺄 변형(주제:이름 → [변형]) — 쓰레기 글자 · 이름과 같음 */
const VAR_DROP = {
  'liar-school:축제': ['학园제'], // 한자 섞인 쓰레기 글자
  'liar-school:분필': ['チョ크'], // 가나 섞인 쓰레기 글자
};

// ── 기존 라이어 세트(다른 주제 같은 단어 목록용 — 허용) ─────────────────────
const baseFiles = readdirSync(DIR).filter((f) => /^liar-[a-z]+\.json$/.test(f) && !Object.keys(META).includes(f.replace('.json', '')));
const taken = new Map();
for (const f of baseFiles) for (const it of JSON.parse(readFileSync(path.join(DIR, f), 'utf8')).items) for (const v of [it.name, ...it.variants]) taken.set(C(v), `${it.id} ${it.name}`);

const rep = { round: 'G055', input: merged.length, sets: [], dropped: [], foolFixed: [], foolDropped: [], varDropped: [], cross: [], crossNew: [] };
const out = {}; const own = {}; // topic → canon → name
for (const x of merged) {
  const key = `${x.topic}:${x.w}`;
  if (!META[x.topic]) throw new Error(`모르는 주제 ${x.topic}`);
  const c = C(x.w);
  if (DROP[key]) { rep.dropped.push({ topic: x.topic, w: x.w, why: DROP[key] }); continue; }
  if ([...x.w.replace(/\s/g, '')].length < 2) { rep.dropped.push({ topic: x.topic, w: x.w, why: '한 글자(18 §12 막힘)' }); continue; }
  const set = (own[x.topic] ??= new Map());
  if (set.has(c)) throw new Error(`세트 안 이름 겹침 ${key}`);
  const hit = taken.get(c);
  if (hit) rep.cross.push({ topic: x.topic, w: x.w, with: hit });
  for (const [t, m] of Object.entries(own)) if (t !== x.topic && m.has(c)) rep.crossNew.push({ topic: x.topic, w: x.w, with: `${t} ${m.get(c)}` });
  // 변형
  const vs = [];
  for (const v of x.var ?? []) {
    const cv = C(v);
    if ((VAR_DROP[key] ?? []).includes(v)) { rep.varDropped.push({ topic: x.topic, w: x.w, v, why: '쓰레기 글자' }); continue; }
    if (!cv || cv === c) { rep.varDropped.push({ topic: x.topic, w: x.w, v, why: '이름과 같음(띄어쓰기 · 꼴 차이)' }); continue; }
    if (vs.some((y) => C(y) === cv)) continue;
    if (/[^\p{L}\p{N} .·'\-&:!?]/u.test(v) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(v)) { rep.varDropped.push({ topic: x.topic, w: x.w, v, why: '특수문자 · 외국 글자' }); continue; }
    const others = merged.filter((y) => y.topic === x.topic && y.w !== x.w && !DROP[`${y.topic}:${y.w}`]);
    const o = others.find((y) => C(y.w) === cv || (y.var ?? []).some((z) => C(z) === cv));
    if (o) { rep.varDropped.push({ topic: x.topic, w: x.w, v, why: `같은 세트 ${o.w} 과 겹침` }); continue; }
    vs.push(v);
  }
  // fool
  const fx = FOOL_FIX[key] ?? {};
  for (const f of Object.keys(fx)) if (!x.fool.includes(f)) throw new Error(`${key}: fool ${f} 없음`);
  let fool = x.fool.map((f) => { if (fx[f]) { rep.foolFixed.push({ topic: x.topic, w: x.w, from: f, to: fx[f] }); return fx[f]; } return f; });
  const mine = new Set([x.w, ...vs].map(C)); const seen = new Set();
  fool = fool.filter((f) => { const cf = C(f); if (mine.has(cf) || seen.has(cf)) { rep.foolDropped.push({ topic: x.topic, w: x.w, f, why: mine.has(cf) ? '자기 name·변형과 같음' : '겹침' }); return false; } seen.add(cf); return true; });
  (out[x.topic] ??= []).push({ id: null, name: x.w, variants: vs, tags: [x.sub], sub: x.sub, era: x.era, diff: x.diff, fool, draw: false, liar: true, qid: null });
  set.set(c, x.w);
}
for (const k of [...Object.keys(DROP), ...Object.keys(FOOL_FIX), ...Object.keys(VAR_DROP)]) if (!merged.some((x) => `${x.topic}:${x.w}` === k)) throw new Error(`없는 단어 ${k}`);

const built = [];
for (const topic of Object.keys(META)) {
  const items = out[topic];
  items.forEach((it, i) => { it.id = `${topic}-${String(i + 1).padStart(3, '0')}`; });
  const t = {
    topic, nameKo: META[topic].nameKo, kind: 'open', version: 1, asOf: '2026-11-10', createdRound: 'G055', status: 'candidate',
    source: [{ url: 'web-desk/liar3', note: 'web-desk/liar3 · Claude Sonnet 5.5(웹 · 찬종 계정) — 누구나 주제 · 30~40 · fool 3 · 찬종 "보편성"(2026-11-10)으로 20 주제 중 5 만 · GEN 이 낯선 단어 · 세트 안 같은 것 · 상관없는 것 · 낯선 fool 만 고침(fool 거리는 V049)', fetchedAt: '2026-11-10', read: true }],
    liar: true, draw: false, timeSec: 30, tags: META[topic].tags, count: items.length, items, verify: null,
  };
  built.push({ file: path.join(DIR, `${topic}.json`), t });
  rep.sets.push({ slug: topic, nameKo: t.nameKo, input: merged.filter((x) => x.topic === topic).length, count: items.length, ex: items.slice(0, 5).map((i) => `${i.name} → ${i.fool.join(',')}`) });
}
rep.total = built.reduce((a, b) => a + b.t.count, 0);
for (const s of rep.sets) console.log(s.slug.padEnd(18), s.nameKo.padEnd(8), `${s.input}→${s.count}`);
console.log('합', rep.total, '· 뺌', rep.dropped.length, '· fool 바꿈', rep.foolFixed.length, '· fool 뺌', rep.foolDropped.length, JSON.stringify(rep.foolDropped), '· var 뺌', rep.varDropped.length, '· 기존 주제 같은 단어', rep.cross.length, '· 새 주제 사이', rep.crossNew.length);
for (const d of rep.dropped) console.log('  뺌', d.topic, d.w, '—', d.why);
for (const d of rep.varDropped) console.log('  var 뺌', d.topic, d.w, d.v, '—', d.why);
console.log('  새 주제 사이', rep.crossNew.map((d) => `${d.w}(${d.topic} ↔ ${d.with})`).join(' · '));
const short = built.flatMap((b) => b.t.items.filter((i) => i.fool.length < 2).map((i) => `${i.id} ${i.name}`));
if (short.length) { console.log('★ fool 2 미만', short); process.exit(1); }
if (APPLY) {
  for (const { file, t } of built) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g055-liar3.json'), JSON.stringify(rep, null, 1) + '\n');
  console.log('적용');
} else console.log('dry-run (--apply 로 씀)');
