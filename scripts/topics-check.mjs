#!/usr/bin/env node
// =============================================================================
// G036 — 미니게임 "주제 세트" 검사 (docs/18 §9 형식 · D-330)
//   data/minigame/topics/<slug>.json 전부(또는 인자로 준 파일)를 본다.
//   막힘(error): 머리 칸 · 항목 칸 · id 꼴(<slug>-NNN · 번호가 늘어남 — G039: 지운 번호 재사용 안 함) · count = items.length
//                · 세트 안 유일성(name 정규화 겹침 · 변형이 다른 항목의 name/변형과 겹침) · 변형 특수문자
//                · open 수(60~120) · open 세트를 closed 로 표시하지 않음
//   경고(warn): 변형이 제 name 과 정규화로 같음(죽은 변형) · 라틴 변형(§9 게이트 예외 — 사람·작품 이름만) 수
//                · closed 수가 20 미만 / 400 넘음(§9 의 50~250 은 기준 · 주제마다 공식 목록 전부가 원칙)
//   판정 꼴은 퀴즈와 같다: flexCanon(괄호 · 관사 · 가운뎃점 지움 → normalizeAnswer)
//   --fill-qid : 활성 퀴즈 대표 정답(정규화 일치)으로 qid 를 채워 파일에 쓴다(DB 읽기만)
//   --json     : 결과를 JSON 으로
//   ★ G039: 항목 label(선택 · 문자열 · 40자 이하 — 괄호 묶음 · 20자 넘는 name 에 없으면 경고) · verify 칸(있으면 round · verdict)
//   ★ G047: 항목 칸 fool(2~3 · 1~20자 · name 과 다름) · era(classic|modern) · sub · diff(1|2|3) — 라이어 세트(kind open · 머리 liar true)는 필수(막힘) · 수 40~120 · 1글자 name 막힘(18 §12)
// 사용: node scripts/topics-check.mjs [files…] [--fill-qid] [--json]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon, normalizeAnswer, stripArticle, stripParens } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const args = process.argv.slice(2);
const FILL = args.includes('--fill-qid');
const JSONOUT = args.includes('--json');
let files = args.filter((a) => !a.startsWith('--'));
if (!files.length) files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(DIR, f)) : [];

const HEAD = ['topic', 'nameKo', 'kind', 'version', 'asOf', 'createdRound', 'status', 'source', 'liar', 'draw', 'timeSec', 'tags', 'count', 'items', 'verify'];
const ITEM_OK = new Set(['id', 'name', 'label', 'variants', 'tags', 'year', 'draw', 'liar', 'qid', 'note', 'fool', 'era', 'sub', 'diff', 'g']); // ★ G039: label = 화면용 짧은 이름(판정엔 안 씀 · 18 §9 · CV-165 ②) · ★ G047: fool · era · sub · diff(18 §12 제시어 세트)
const ERA = new Set(['classic', 'modern']);
/** ★ G047 — 라이어 제시어 세트(kind open · 머리 liar true) = fool · era · sub · diff 필수 · 수 40~120 */
export const isLiarSet = (t) => t.kind === 'open' && t.liar === true;
/** ★ G048 — 캐치마인드 제시어 세트(kind open · 머리 draw true · liar false · draw-*) = diff 필수 · 수 40~400 · fool 없음 */
export const isDrawSet = (t) => t.kind === 'open' && t.draw === true && t.liar === false && String(t.topic ?? '').startsWith('draw-');
const STATUS = new Set(['candidate', 'verified', 'rejected', 'loaded']);
const SPECIAL = /[^\p{L}\p{N} .·'\-&:!?]/u; // 변형에 허용: 공백 · 마침표 · 가운뎃점 · 따옴표 · 하이픈 · & · : · ! · ? (판정이 지우거나 정규화가 다룬다)
const LATIN = /[A-Za-z]/;
const HANGUL = /[가-힣]/;
export const canon = (s) => flexCanon(String(s ?? ''));
// ★ R090 (D-347) — 유일성 막힘은 기호를 지우기 전 꼴(R089 표준형)로 본다. 기호를 지운 꼴만 겹치면 경고(판정 맵이 그 열쇠를 빼 원꼴로만 맞는다 — 니드런♀ · 니드런♂)
const OLD_PUNCT = /[·・･‧∙.,，~〜～]/g;
export const canonStrict = (s) => {
  const t = stripArticle(stripParens(String(s ?? '').normalize('NFC')));
  return normalizeAnswer(/^[\d\s.,，]+$/.test(t) ? t.replace(/[,，]/g, '') : t.replace(OLD_PUNCT, ''));
};

export function checkTopic(t, file) {
  const err = []; const warn = []; const stat = { latinVariants: 0, deadVariants: 0 };
  const slug = path.basename(file, '.json');
  for (const k of HEAD) if (!(k in t)) err.push(`머리 칸 없음: ${k}`);
  if (t.topic !== slug) err.push(`topic(${t.topic}) ≠ 파일 이름(${slug})`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) err.push(`slug 꼴: ${slug}`);
  if (!['closed', 'open'].includes(t.kind)) err.push(`kind: ${t.kind}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.asOf ?? '')) err.push(`asOf: ${t.asOf}`);
  if (!STATUS.has(t.status)) err.push(`status: ${t.status}`);
  if (!Array.isArray(t.source) || !t.source.length || t.source.some((s) => !s.url || !s.fetchedAt)) err.push('source: [{url, note, fetchedAt}] 하나 이상');
  for (const k of ['liar', 'draw']) if (typeof t[k] !== 'boolean') err.push(`${k}: boolean`);
  if (typeof t.timeSec !== 'number') err.push('timeSec: number');
  // ★ G049 — 머리 scope(선택 · 정답 범위 한 줄 · 플레이어 말투 · 18 §9 "세트 이름 = 정답 범위") — 문자열 · 빈칸 아님 · 60자 이하
  if ('scope' in t && (typeof t.scope !== 'string' || !t.scope.trim() || [...t.scope].length > 60)) err.push('scope: 문자열 · 빈칸 아님 · 60자 이하');
  // ★ G050 — 머리 group(선택 · 같은 group 세트는 주제 추첨에서 한 자리 — MAIN R090 · 예 "metro") — 소문자 slug 꼴
  if ('group' in t && (typeof t.group !== 'string' || !/^[a-z][a-z0-9-]*$/.test(t.group))) err.push('group: 소문자 slug 꼴 문자열');
  // ★ R090 — 머리 optIn(선택 · 방장 주제 고르기에서 기본 체크 해제)
  if ('optIn' in t && typeof t.optIn !== 'boolean') err.push('optIn: true | false');
  if (!Array.isArray(t.tags)) err.push('tags: []');
  const items = Array.isArray(t.items) ? t.items : [];
  if (t.count !== items.length) err.push(`count ${t.count} ≠ items ${items.length}`);
  const liarSet = isLiarSet(t);
  // ★ G053: liar-<주제>-2(같은 주제의 candidate 조각 — 기존 verified 세트를 적재에서 지키려 나눔)는 하한 20(낯선 단어 · 한 글자를 뺀 뒤 악기 27)
  const liarPart = /-2$/.test(String(t.topic ?? ''));
  if (t.kind === 'open' && liarSet && (items.length < (liarPart ? 20 : 40) || items.length > 120)) err.push(`라이어 세트 수 ${items.length}(${liarPart ? 20 : 40}~120 — 18 §12)`);
  const drawSet = isDrawSet(t);
  // ★ G051: 상한 400 → 2,000(2차 합치기 — 사물 ≈ 1,270) · draw-<테마>-2(같은 테마의 candidate 조각 — 기존 verified 세트를 적재에서 지키려 나눔)는 하한 없음
  const drawPart = /-2$/.test(String(t.topic ?? ''));
  if (t.kind === 'open' && drawSet && ((!drawPart && items.length < 40) || items.length > 2000)) err.push(`캐치 세트 수 ${items.length}(40~2,000 — 18 §12 · G051)`);
  if (t.kind === 'open' && !liarSet && !drawSet && (items.length < 60 || items.length > 120)) err.push(`open 수 ${items.length}(60~120)`);
  if (t.kind === 'closed' && (items.length < 20 || items.length > 400)) warn.push(`closed 수 ${items.length}(기준 50~250 · 공식 목록 전부가 원칙)`);
  const byName = new Map(); const byVar = new Map(); const byFlex = new Map();
  let lastNum = 0;
  items.forEach((it, i) => {
    // ★ G039: id 는 <slug>-NNN · 앞 항목보다 큰 번호(지운 번호는 다시 안 씀 · 더한 항목은 마지막 번호 + 1 — 18 §9)
    const idm = String(it.id ?? '').startsWith(slug + '-') ? String(it.id).slice(slug.length + 1) : '';
    const num = /^\d{3,}$/.test(idm) ? Number(idm) : NaN;
    if (Number.isNaN(num)) err.push(`id 꼴 ${it.id} — <slug>-NNN`);
    else if (i > 0 && !(num > lastNum)) err.push(`id ${it.id} — 앞 번호(${lastNum})보다 커야 함`);
    lastNum = num;
    for (const k of Object.keys(it)) if (!ITEM_OK.has(k)) err.push(`${it.id}: 모르는 칸 ${k}`);
    if (typeof it.name !== 'string' || !it.name.trim()) err.push(`${it.id}: name`);
    if (!Array.isArray(it.variants)) err.push(`${it.id}: variants []`);
    if (!Array.isArray(it.tags)) err.push(`${it.id}: tags []`);
    for (const k of ['draw', 'liar']) if (typeof it[k] !== 'boolean') err.push(`${it.id}: ${k} boolean`);
    if (!(it.qid === null || Number.isInteger(it.qid))) err.push(`${it.id}: qid null|정수`);
    if ('year' in it && !Number.isInteger(it.year)) err.push(`${it.id}: year 정수`);
    // ★ G047 — 제시어 칸(18 §12): 라이어 세트는 필수 · 다른 세트는 있으면 꼴만
    if (liarSet || 'fool' in it) {
      const f = it.fool;
      if (!Array.isArray(f) || f.length < 2 || f.length > 3) err.push(`${it.id}: fool 2~3 개 배열`);
      else for (const w of f) {
        if (typeof w !== 'string' || !w.trim() || [...w].length > 20) err.push(`${it.id}: fool 단어 1~20자 '${w}'`);
        else if (canon(w) === canon(it.name)) err.push(`${it.id}: fool 이 name 과 같음 '${w}'`);
        else if (SPECIAL.test(w)) err.push(`${it.id}: fool 특수문자 '${w}'`);
      }
      if (Array.isArray(f) && new Set(f.map(canon)).size !== f.length) err.push(`${it.id}: fool 겹침`);
    }
    if (liarSet || 'era' in it) { if (!ERA.has(it.era)) err.push(`${it.id}: era classic|modern`); }
    if (liarSet || 'sub' in it) { if (typeof it.sub !== 'string' || !it.sub.trim()) err.push(`${it.id}: sub 문자열`); }
    if (liarSet || drawSet || 'diff' in it) { if (![1, 2, 3].includes(it.diff)) err.push(`${it.id}: diff 1|2|3`); }
    // ★ G051 — g = 게임성(1 밋밋 · 2 무난 · 3 재미 · 선택 · 보관만 — 추첨에 아직 안 씀)
    if ('g' in it && ![1, 2, 3].includes(it.g)) err.push(`${it.id}: g 1|2|3`);
    if ([...String(it.name ?? '')].length < 2 && (liarSet || drawSet || 'fool' in it)) err.push(`${it.id}: 1글자 name(18 §12)`);
    if ('label' in it && (typeof it.label !== 'string' || !it.label.trim() || [...it.label].length > 40)) err.push(`${it.id}: label 문자열 · 빈칸 아님 · 40자 이하`);
    if (/[(（]/.test(it.name ?? '') && !('label' in it) || [...(it.name ?? '')].length > 20 && !('label' in it)) warn.push(`${it.id}: label 없음(괄호 묶음 · 20자 넘는 name — CV-165 ②)`);
    const n = canonStrict(it.name);
    if (!n) err.push(`${it.id}: name 정규화가 빔`);
    if (byName.has(n)) err.push(`유일성: name 겹침 ${it.id} '${it.name}' = ${byName.get(n)}`); else byName.set(n, it.id);
    const nf = canon(it.name);
    if (nf !== n && byFlex.has(nf) && byFlex.get(nf) !== it.id) warn.push(`기호 지운 꼴 겹침 '${it.name}' ${it.id} ↔ ${byFlex.get(nf)} — 원꼴로만 맞음(R090)`);
    else byFlex.set(nf, it.id);
    for (const v of it.variants ?? []) {
      if (typeof v !== 'string' || !v.trim()) { err.push(`${it.id}: 빈 변형`); continue; }
      if (SPECIAL.test(v)) err.push(`${it.id}: 변형 특수문자 '${v}'`);
      if (LATIN.test(v) && !HANGUL.test(v)) stat.latinVariants++;
      const c = canonStrict(v);
      if (c === n) { stat.deadVariants++; warn.push(`${it.id}: 죽은 변형 '${v}'(name 과 같음)`); continue; }
      if (byVar.has(c) && byVar.get(c) !== it.id) err.push(`유일성: 변형 겹침 '${v}' ${it.id} ↔ ${byVar.get(c)}`);
      byVar.set(c, it.id);
    }
  });
  for (const [c, id] of byVar) if (byName.has(c) && byName.get(c) !== id) err.push(`유일성: ${id} 의 변형이 ${byName.get(c)} 의 name 과 같음`);
  // ★ G039 — verify 칸 느슨 검사(있으면 round · verdict)
  if (t.verify != null && (typeof t.verify !== 'object' || !t.verify.round || !t.verify.verdict)) err.push('verify: {round, verdict, …} 또는 null');
  if (t.kind === 'open' && t.topic && items.some((it) => it.liar === false && it.draw === false)) warn.push('open 인데 liar · draw 둘 다 false 인 항목이 있음');
  stat.labels = items.filter((x) => 'label' in x).length;
  stat.items = items.length; stat.liar = items.filter((x) => x.liar).length; stat.draw = items.filter((x) => x.draw).length; stat.qid = items.filter((x) => x.qid != null).length;
  return { file: slug, kind: t.kind, err, warn, stat };
}

async function fillQid(list) {
  const pg = (await import('pg')).default;
  process.loadEnvFile?.(path.join(ROOT, '.env'));
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  try {
    const rows = (await c.query(`select q.id::int id, q.display_answer from questions q where q.is_active order by q.id`)).rows;
    const m = new Map(); for (const r of rows) { const k = normalizeAnswer(r.display_answer); if (!m.has(k)) m.set(k, r.id); }
    for (const { file, t } of list) {
      let n = 0; for (const it of t.items) { const q = m.get(normalizeAnswer(it.name)) ?? null; if (it.qid !== q) { it.qid = q; n++; } }
      writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
      if (!JSONOUT) console.log(`[qid] ${path.basename(file)} 바꿈 ${n} · 매핑 ${t.items.filter((x) => x.qid != null).length}`);
    }
  } finally { await c.end(); }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/topics-check.mjs')) {
  const list = files.map((f) => ({ file: f, t: JSON.parse(readFileSync(f, 'utf8')) }));
  if (FILL) await fillQid(list);
  const res = list.map(({ file, t }) => checkTopic(t, file));
  if (JSONOUT) console.log(JSON.stringify(res, null, 1));
  else {
    for (const r of res) {
      console.log(`${r.err.length ? '★' : 'ok'} ${r.file} [${r.kind}] 항목 ${r.stat.items} · liar ${r.stat.liar} · draw ${r.stat.draw} · qid ${r.stat.qid} · 라틴 변형 ${r.stat.latinVariants} · 경고 ${r.warn.length}`);
      for (const e of r.err) console.log('   막힘', e);
      for (const w of r.warn.slice(0, 5)) console.log('   경고', w);
      if (r.warn.length > 5) console.log(`   경고 … 외 ${r.warn.length - 5}`);
    }
    const bad = res.filter((r) => r.err.length).length;
    console.log(`[topics-check] 세트 ${res.length} · 막힘 있는 세트 ${bad} · 항목 ${res.reduce((a, r) => a + r.stat.items, 0)}`);
  }
  if (res.some((r) => r.err.length)) process.exitCode = 1;
}
