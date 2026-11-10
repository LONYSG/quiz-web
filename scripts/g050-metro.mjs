#!/usr/bin/env node
// =============================================================================
// G050 — 수도권 전철 호선별 세트 13(찬종 2026-11-09 "호선 기준으로" · 18 §9 "세트 이름 = 정답 범위") — 파일만 · DB 쓰기 없음
//   입력: audit/g050-raw/<key>.wiki(위키백과 노선 문서 원문 · pages.json = 주소 · 읽은 날) · 옛 seoul-subway-station(git 69f3178d~1)
//   역 = "역 목록" 절 표의 행마다 첫 "○○역" 링크(부역명 괄호 · <small> 떼기) · 같은 세트 안 같은 이름은 하나(계통 표 반복)
//   빼기: 기울임(미개통 — 1호선 부성(가칭) · 수인분당 학익) · 표 밖 글줄 링크 · EXCLUDE(개통 기록 없음)
//   더하기: EXTRA(그 노선 이름으로 운행하는 직결 구간이 다른 문서에 있는 것 — 5호선 하남선 · 8호선 별내선)
//   꼴 = 옛 세트 꼴: name = '역' 뗀 꼴(서울역만 '서울역') · 변형 = '○○역'(서울역은 '서울') + 옛 세트 변형 물려받기
//   머리: closed · candidate · group "metro" · scope · liar/draw false · timeSec 60
//   산출: topics/metro-*.json · audit/g050-raw/old-variants.json · audit/g050-metro.json
// 사용: node scripts/g050-metro.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data/pipeline/audit/g050-raw');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const C = (s) => flexCanon(String(s ?? ''));
const pages = JSON.parse(readFileSync(path.join(RAW, 'pages.json'), 'utf8'));

const LINES = [
  ['line1', 'metro-line1', '수도권 전철 1호선 역', '소요산·연천부터 인천 · 신창 · 광명 · 서동탄까지 전 구간'],
  ['line2', 'metro-line2', '수도권 전철 2호선 역', '본선 순환 + 성수지선 · 신정지선 전부'],
  ['line3', 'metro-line3', '수도권 전철 3호선 역', '대화부터 오금까지 전 구간'],
  ['line4', 'metro-line4', '수도권 전철 4호선 역', '진접부터 오이도까지 전 구간'],
  ['line5', 'metro-line5', '수도권 전철 5호선 역', '방화부터 하남검단산 · 마천까지 두 갈래 전부'],
  ['line6', 'metro-line6', '수도권 전철 6호선 역', '응암 순환부터 신내까지 전 구간'],
  ['line7', 'metro-line7', '수도권 전철 7호선 역', '장암부터 석남까지 전 구간'],
  ['line8', 'metro-line8', '수도권 전철 8호선 역', '별내부터 모란까지 전 구간(별내선 포함)'],
  ['line9', 'metro-line9', '수도권 전철 9호선 역', '개화부터 중앙보훈병원까지 전 구간'],
  ['suin-bundang', 'metro-suin-bundang', '수인분당선 역', '청량리부터 인천까지 전 구간'],
  ['sinbundang', 'metro-sinbundang', '신분당선 역', '신사부터 광교까지 전 구간'],
  ['gyeongui-jungang', 'metro-gyeongui-jungang', '경의중앙선 역', '임진강 · 문산부터 지평까지 + 서울역 갈래'],
  ['arex', 'metro-arex', '공항철도 역', '서울역부터 인천공항2터미널까지'],
];
/** 페이지 표에 있지만 개통 기록이 없는 역(보고서 · V046 확인) */
const EXCLUDE = { line4: { 풍양: '진접선 개통(2022-03-19) 때 "풍양 제외" · 그 뒤 개통 기록이 페이지에 없음' } };
/** 다른 문서에 있는 직결 구간(GEN 지식 · 페이지 연혁 줄로 운행 확인) */
const EXTRA = {
  line5: { why: '하남선 — 5호선 페이지 연혁 2020-08-08 · 2021-03-27 개통 · 5호선 직결(역 목록 표는 "↓ 하남선 강일역 방면" 줄로 넘김)', names: ['강일', '미사', '하남풍산', '하남시청', '하남검단산'] },
  line8: { why: '별내선 — 8호선 페이지 연혁 "2024-08-10 암사~별내 개통 및 8호선으로 통합"(역 목록 표는 "↑ 별내선" 줄로 넘김)', names: ['별내', '다산', '동구릉', '구리', '장자호수공원', '암사역사공원'] },
};
/** 흔히 부르는 꼴(GEN · 몇 개만) */
const HAND = { 평택지제: ['지제'], 가산디지털단지: ['가디'], 인천공항1터미널: ['인천공항'], 총신대입구: ['이수'] };

function parse(key) {
  const s = readFileSync(path.join(RAW, `${key}.wiki`), 'utf8');
  const L = s.split('\n');
  const st = L.findIndex((l) => /^==+\s*역 목록\s*==+/.test(l));
  let en = L.findIndex((l, i) => i > st && /^==\s*[^=]/.test(l));
  if (en < 0) en = L.length;
  const rows = L.slice(st, en).join('\n').split(/\n\|-[^\n]*/);
  const out = []; const dropped = [];
  for (const r of rows) {
    const m = r.match(/^(\|\s*'')?.*?\[\[([^\]|]*?역(?:\s*\([^)]*\))?)(?:\|([^\]]+))?\]\]/s);
    if (!m) continue;
    // 행 안 첫 셀 링크만(표 행: "! 번호" 다음 "| [[..]]") — 글줄(* 나 문장)은 건너뜀
    const line = r.split('\n').find((x) => x.includes(`[[${m[2]}`)) ?? '';
    if (!/^\|/.test(line.trim()) || /^\|\s*colspan|^!/.test(line.trim())) { dropped.push({ link: m[2], why: '표 행 첫 칸 아님' }); continue; }
    const name = (m[3] ?? m[2]).replace(/<[^>]+>/g, '').replace(/\s*\([^)]*\)\s*/g, '').replace(/역$/, (x) => (m[3] ? x : '')).trim();
    if (/^\|\s*''(?!')/.test(line.trim())) { dropped.push({ name, why: '기울임 — 미개통' }); continue; }
    out.push(name);
  }
  return { list: out, dropped };
}

// 옛 세트 → 변형 표
const old = JSON.parse(execSync('git show 69f3178d~1:data/minigame/topics/seoul-subway-station.json', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 }));
const oldVar = {}; for (const it of old.items) oldVar[it.name.replace(/역$/, '')] = { name: it.name, variants: it.variants, tags: it.tags };

const report = { round: 'G050', fetchedAt: pages.fetchedAt, sets: [], excluded: [], extra: [], dupInSet: [], oldMissing: [], check: [], oldVarDropped: [] };
const built = [];
for (const [key, slug, nameKo, scope] of LINES) {
  const { list, dropped } = parse(key);
  const seen = new Map(); const names = [];
  for (const n0 of [...list, ...(EXTRA[key]?.names ?? [])]) {
    const n = n0.replace(/역$/, '') || n0;
    if (EXCLUDE[key]?.[n]) { if (!report.excluded.some((x) => x.key === key && x.name === n)) report.excluded.push({ key, name: n, why: EXCLUDE[key][n] }); continue; }
    if (seen.has(C(n))) { continue; }
    seen.set(C(n), true); names.push(n);
  }
  if (EXTRA[key]) report.extra.push({ key, ...EXTRA[key] });
  const items = names.map((n, i) => {
    const o = oldVar[n];
    const name = n === '서울' ? '서울역' : n;
    const vs = [];
    const push = (v) => { if (v && C(v) !== C(name) && !vs.some((x) => C(x) === C(v))) vs.push(v); };
    push(n === '서울' ? '서울' : `${n}역`);
    for (const v of o?.variants ?? []) push(v);
    for (const v of HAND[n] ?? []) push(v);
    return { id: `${slug}-${String(i + 1).padStart(3, '0')}`, name, variants: vs, tags: [], draw: false, liar: false, qid: null };
  });
  // 옛 변형이 같은 세트의 다른 역 이름과 같으면 물려받지 않음(예: 8호선 암사 ← 암사역사공원 = 별내선 새 역)
  const nameSet = new Map(items.map((x) => [C(x.name), x.id]));
  for (const it of items) it.variants = it.variants.filter((v) => { const o = nameSet.get(C(v)); if (o && o !== it.id) { report.oldVarDropped.push({ slug, id: it.id, name: it.name, v }); return false; } return true; });
  // 세트 안 변형 겹침 검사
  const owner = new Map();
  for (const it of items) for (const v of [it.name, ...it.variants]) { const c = C(v); if (owner.has(c) && owner.get(c) !== it.id) report.dupInSet.push({ slug, a: owner.get(c), b: it.id, v }); owner.set(c, it.id); }
  const pg = pages.pages[key];
  const t = {
    topic: slug, nameKo, scope, group: 'metro', kind: 'closed', version: 1, asOf: '2026-11-10', createdRound: 'G050', status: 'candidate',
    source: [{ url: pg.url, note: `위키백과 "${pg.title}" 역 목록 표(원문 audit/g050-raw/${key}.wiki)${EXTRA[key] ? ` + ${EXTRA[key].why}` : ''}${EXCLUDE[key] ? ` · 뺌: ${Object.keys(EXCLUDE[key]).join(' · ')}(개통 기록 없음)` : ''}`, fetchedAt: pages.fetchedAt, read: true }],
    liar: false, draw: false, timeSec: old.timeSec ?? 60, tags: ['지리', '교통', '수도권 전철'], count: items.length, items, verify: null,
  };
  built.push({ file: path.join(DIR, `${slug}.json`), t });
  report.sets.push({ slug, nameKo, count: items.length, inherited: items.filter((x) => oldVar[x.name.replace(/역$/, '')]).length, dropped: dropped.filter((d) => d.why.startsWith('기울임')), page: pg.url });
}
// 옛 273 중 새 세트 어디에도 없는 것
const allNew = new Set(built.flatMap((b) => b.t.items.flatMap((x) => [x.name, ...x.variants].map(C))));
for (const it of old.items) if (!allNew.has(C(it.name))) report.oldMissing.push(it.name);
// 환승역 겹침(이름이 둘 이상 세트에)
const cnt = new Map(); for (const b of built) for (const x of b.t.items) cnt.set(x.name, (cnt.get(x.name) ?? 0) + 1);
report.transfer = [...cnt.entries()].filter(([, n]) => n > 1).length;
report.transferTop = [...cnt.entries()].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
// dev 제보 #117 · #118 답
for (const a of ['수원', '수원역', '수원시청역', '세류역', '세류', '금정역', '금정', '광명역', '광명']) {
  report.check.push({ answer: a, sets: built.filter((b) => b.t.items.some((x) => [x.name, ...x.variants].some((v) => C(v) === C(a)))).map((b) => b.t.topic) });
}
writeFileSync(path.join(RAW, 'old-variants.json'), JSON.stringify(oldVar, null, 1) + '\n');
for (const s of report.sets) console.log(s.slug.padEnd(24), String(s.count).padStart(3), '· 옛 변형 물려받음', s.inherited, s.dropped.length ? `· 미개통 뺌 ${s.dropped.map((d) => d.name).join(' · ')}` : '');
console.log('합', report.sets.reduce((a, s) => a + s.count, 0), '· 환승 이름(2 세트 이상)', report.transfer, '· 3 세트 이상', report.transferTop.join(' · '));
console.log('옛 변형 안 물려받음', JSON.stringify(report.oldVarDropped));
console.log('뺌', JSON.stringify(report.excluded), '· 세트 안 겹침', JSON.stringify(report.dupInSet));
console.log('옛 273 중 없음', report.oldMissing.length, report.oldMissing.join(' · '));
for (const c of report.check) console.log('  제보', c.answer, '→', c.sets.join(' · ') || '없음');
if (APPLY) {
  for (const { file, t } of built) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g050-metro.json'), JSON.stringify(report, null, 1) + '\n');
  console.log('적용 · audit/g050-metro.json');
} else console.log('dry-run (--apply 로 씀)');
