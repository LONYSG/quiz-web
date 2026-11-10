#!/usr/bin/env node
// =============================================================================
// G053 — 라이어 제시어 2차 합치기(web-desk/liar2 · 찬종의 웹 Claude Sonnet 5.5 · 15 주제 × 40 · fool 3) — 파일만 · DB 쓰기 없음
//   → liar-<주제>-2.json 15(candidate · 머리는 기존 세트와 같게 · id liar-<주제>-2-NNN) · 기존 15 파일은 안 건드림(849 그대로 적재)
//   GEN 재독(fool 거리 판정은 V048 몫 — 안 함):
//     뺌 = 기존 라이어 단어(name · 변형)와 겹침(자동) · 범죄·사건으로 처벌받은 인물(DROP) · 일반인이 모르는 단어(DROP) · 한 글자(자동)
//     fool 바꿈 = 사건 인물 · 없어졌거나 낯선 이름 · 쓰레기 글자(FOOL_FIX) · fool 이 자기 name·변형과 같으면 뺌(자동 — 2 미만이면 막힘)
//     var: 같은 항목 안 겹침 · 다른 라이어 항목 name·변형과 겹치면 뺌(자동)
//   산출: topics/liar-*-2.json · audit/g053-liar2.json
// 사용: node scripts/g053-liar2.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const C = (s) => flexCanon(String(s ?? ''));
const merged = JSON.parse(readFileSync(path.join(ROOT, 'web-desk/liar2/_merged.json'), 'utf8'));

/** 뺄 항목(주제:이름 → 사유) */
const DROP = {
  'liar-celebrity:하정우': '사건 — 프로포폴 벌금(G052 캐치에서도 뺌)',
  'liar-celebrity:이경규': '사건 — 약물운전 벌금(G049 fool 에서도 교체 · 찬종)',
  'liar-sport:마라도나': '사건 — 약물 · 도핑 징계(G048 캐치에서도 논란으로 뺌)',
  'liar-music:너나 해': '낯선 노래 제목',
  'liar-music:서울의 달': '낯선 노래 제목',
  'liar-instrument:아쟁': '낯선 악기(V044 가 기존 세트에서도 뺌)',
  'liar-instrument:디제리두': '낯선 악기', 'liar-instrument:글로켄슈필': '낯선 악기', 'liar-instrument:반도네온': '낯선 악기',
  'liar-instrument:카주': '낯선 악기', 'liar-instrument:잉글리시 호른': '낯선 악기', 'liar-instrument:생황': '낯선 악기',
  'liar-instrument:양금': '낯선 악기', 'liar-instrument:알프호른': '낯선 악기', 'liar-instrument:코넷': '낯선 악기', 'liar-instrument:류트': '낯선 악기',
};
/** fool 바꿈(주제:이름 → {옛: 새}) — 같은 sub 의 아는 단어 */
const FOOL_FIX = {
  'liar-brand:세븐일레븐': { 미니스톱: 'GS25' }, // 미니스톱 브랜드 사라짐(2024~ 세븐일레븐 전환)
  'liar-brand:다음': { 줌: '네이버', 파란: '구글' }, // 파란 서비스 끝(2012) · 줌 낯섦
  'liar-brand:롯데리아': { 프랭크버거: '맘스터치' }, // 낯섦
  'liar-brand:무인양품': { 자라홈: '모던하우스' }, // 낯섦
  'liar-brand:까르띠에': { 반클리프아펠: '샤넬' }, // 낯섦
  'liar-celebrity:박효신': { 이수: '성시경' }, // 사건 인물
  'liar-celebrity:신동엽': { 이경규: '강호동' }, // 사건(약물운전 벌금)
  'liar-celebrity:김구라': { 이경규: '전현무' },
  'liar-sport:펠레': { 마라도나: '메시', 베켄바우어: '지단' }, // 사건 · 낯섦
  'liar-sport:피구': { dodge: '배구' }, // 쓰레기 글자
};
/** V048 이 볼 인물(분쟁 · 사생활 · 의혹 수준 — 빼지 않음 · 최종은 설계) */
const WATCH = {
  '빅뱅': '멤버 승리 사건(그룹은 유지 — 항목 + fool 여럿)', '김건모': '성폭행 의혹(무혐의) · 활동 중단', '박효신': '사기 혐의(무죄) · 소속사 분쟁',
  '엑소': '멤버 탈퇴 · 소속사 분쟁', '카라': '멤버 사망 · 소속사 분쟁', '마이클 잭슨': '아동 성추행 의혹(무죄)', '박세리': '재단 · 부친 분쟁',
  '브래드 피트': '이혼 소송', '타이거 우즈': '사생활 스캔들 · 음주운전 체포(2017)', '김구라': '과거 막말 논란', '저스틴 비버': '사생활 논란',
};

// ── 기존 라이어 세트 ─────────────────────────────────────────────────────────
const baseFiles = readdirSync(DIR).filter((f) => /^liar-[a-z]+\.json$/.test(f));
const base = Object.fromEntries(baseFiles.map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(path.join(DIR, f), 'utf8'))]));
const taken = new Map(); // 라이어 전체 canon → 'topic id name'
for (const t of Object.values(base)) for (const it of t.items) for (const v of [it.name, ...it.variants]) taken.set(C(v), `${it.id} ${it.name}`);

const rep = { round: 'G053', input: merged.length, sets: [], dropped: [], foolFixed: [], foolDropped: [], varDropped: [], watch: [], cross: [] };
const out = {};
for (const x of merged) {
  const key = `${x.topic}:${x.w}`;
  const c = C(x.w);
  if (DROP[key]) { rep.dropped.push({ topic: x.topic, w: x.w, why: DROP[key] }); continue; }
  if ([...x.w.replace(/\s/g, '')].length < 2) { rep.dropped.push({ topic: x.topic, w: x.w, why: '한 글자(18 §12 막힘)' }); continue; }
  const hit = taken.get(c);
  if (hit && hit.startsWith(x.topic + '-')) { rep.dropped.push({ topic: x.topic, w: x.w, why: `기존 단어와 겹침(${hit})` }); continue; }
  if (hit) rep.cross.push({ topic: x.topic, w: x.w, with: hit }); // 다른 주제의 기존 단어 — 허용(§12 ⓔ)
  const items = (out[x.topic] ??= []);
  const slug = `${x.topic}-2`;
  // 변형
  const vs = [];
  for (const v of x.var ?? []) {
    const cv = C(v);
    if (!cv || cv === c || vs.some((y) => C(y) === cv)) continue;
    if (/[^\p{L}\p{N} .·'\-&:!?]/u.test(v)) { rep.varDropped.push({ topic: x.topic, w: x.w, v, why: '특수문자(topics-check 막힘)' }); continue; }
    const o = taken.get(cv);
    if (o && (o.startsWith(x.topic + '-') && !o.startsWith(slug + ' ')) ) { rep.varDropped.push({ topic: x.topic, w: x.w, v, why: `${o} 과 겹침` }); continue; }
    vs.push(v);
  }
  // fool
  let fool = [...x.fool];
  const fx = FOOL_FIX[key] ?? {};
  fool = fool.map((f) => { if (fx[f]) { rep.foolFixed.push({ topic: x.topic, w: x.w, from: f, to: fx[f] }); return fx[f]; } return f; });
  const own = new Set([x.w, ...vs].map(C));
  const seen = new Set();
  fool = fool.filter((f) => { const cf = C(f); if (own.has(cf) || seen.has(cf)) { rep.foolDropped.push({ topic: x.topic, w: x.w, f, why: own.has(cf) ? '자기 name·변형과 같음' : '겹침' }); return false; } seen.add(cf); return true; });
  for (const f of Object.keys(fx)) if (!x.fool.includes(f)) throw new Error(`${key}: fool ${f} 없음`);
  if (WATCH[x.w]) rep.watch.push({ topic: x.topic, w: x.w, why: WATCH[x.w], as: '항목' });
  for (const f of fool) if (WATCH[f]) rep.watch.push({ topic: x.topic, w: x.w, f, why: WATCH[f], as: 'fool' });
  const it = { id: null, name: x.w, variants: vs, tags: [x.sub], sub: x.sub, era: x.era, diff: x.diff, fool, draw: false, liar: true, qid: null };
  items.push(it);
  for (const v of [x.w, ...vs]) taken.set(C(v), `${slug} ${x.w}`);
}
for (const k of Object.keys(DROP)) if (!merged.some((x) => `${x.topic}:${x.w}` === k)) throw new Error(`DROP 에 없는 단어 ${k}`);
for (const k of Object.keys(FOOL_FIX)) if (!merged.some((x) => `${x.topic}:${x.w}` === k)) throw new Error(`FOOL_FIX 에 없는 단어 ${k}`);

const built = [];
for (const [topic, items] of Object.entries(out).sort()) {
  const b = base[topic]; if (!b) throw new Error(`기존 세트 없음 ${topic}`);
  const slug = `${topic}-2`;
  items.forEach((it, i) => { it.id = `${slug}-${String(i + 1).padStart(3, '0')}`; });
  const t = {
    topic: slug, nameKo: b.nameKo, kind: b.kind, version: 1, asOf: '2026-11-10', createdRound: 'G053', status: 'candidate',
    source: [{ url: 'web-desk/liar2', note: 'web-desk/liar2 · Claude Sonnet 5.5(웹 · 찬종 계정) — 18 §12 기준으로 주제마다 40 · fool 3 · GEN 이 논란 인물 · 낯선 단어 · 기존 겹침 · 사라진/낯선 fool 만 고침(fool 거리는 V048)', fetchedAt: '2026-11-10', read: true }],
    liar: true, draw: false, timeSec: b.timeSec, tags: b.tags, count: items.length, items, verify: null,
  };
  built.push({ file: path.join(DIR, `${slug}.json`), t });
  rep.sets.push({ slug, nameKo: t.nameKo, input: merged.filter((x) => x.topic === topic).length, count: items.length, ex: items.slice(0, 5).map((i) => `${i.name} → ${i.fool.join(',')}`) });
}
rep.total = built.reduce((a, b) => a + b.t.count, 0);
for (const s of rep.sets) console.log(s.slug.padEnd(22), s.nameKo.padEnd(8), `${s.input}→${s.count}`);
console.log('합', rep.total, '· 뺌', rep.dropped.length, '· fool 바꿈', rep.foolFixed.length, '· fool 뺌', rep.foolDropped.length, JSON.stringify(rep.foolDropped), '· var 뺌', rep.varDropped.length, '· 다른 주제 기존 단어', rep.cross.length, '· V048 목록', rep.watch.length);
for (const d of rep.dropped) console.log('  뺌', d.topic, d.w, '—', d.why);
for (const d of rep.varDropped) console.log('  var 뺌', d.topic, d.w, d.v, '—', d.why);
const short = built.flatMap((b) => b.t.items.filter((i) => i.fool.length < 2).map((i) => `${i.id} ${i.name}`));
if (short.length) { console.log('★ fool 2 미만', short); process.exit(1); }
if (APPLY) {
  for (const { file, t } of built) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g053-liar2.json'), JSON.stringify(rep, null, 1) + '\n');
  console.log('적용');
} else console.log('dry-run (--apply 로 씀)');
