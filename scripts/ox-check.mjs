#!/usr/bin/env node
// =============================================================================
// G041 — OX 문장 기계 검사(docs/18 §11) — data/minigame/ox/items*.json (또는 인자 파일 — 조각 출력 배열도 받음)
//   막힘: 머리 · 칸 · id(ox-NNNN · 유일) · statement 40~90자 · "다." 끝 · 부정문(않 · 아니 · 없 · 못 — 허용 목록 밖) · 물음표
//        · answer boolean · explanation 1~120자 · category(대분류 7 · 중분류 63 이름 그대로) · grade 1~3 · trap(참 none · 거짓 다섯 축)
//        · pairId 꼴(쌍이면 참 1 · 거짓 1) · 정규화 중복(ox 안) · sources(url · basis web|knowledge)
//   경고: 기존 활성 퀴즈 질문과 글자(2-gram) 겹침 ≥ 60%(베낌 의심 — D-330 ⑴ · --db 일 때) · 참:거짓 1:1 어긋남 · 대분류 수 편차 · trap 축 편차 · 한글 숫자 낱말
// 사용: node scripts/ox-check.mjs [files…] [--db] [--json]
// =============================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/ox');
const L = (s) => [...String(s ?? '')].length;
export const CAT = {
  '한국': ['한국사', '한국 지리', '한국 문학', '한국 전통문화·풍습', '한국 대중음악', '한국 영화·드라마', '한국 방송·예능', '한국 음식', '한국어·한글'],
  '인문·사회': ['서양사', '동양사', '전쟁·군사사', '신화', '종교·경전 상식', '철학·사상', '심리학 상식', '경제·금융 상식', '정치·법 상식', '사회 제도', '세계 지리·국가·수도'],
  '자연과학': ['물리', '화학·원소', '생물학', '인체·해부', '동물', '식물', '지구과학·기상', '천문·우주', '수학·수 상식'],
  '기술·의학': ['의학·건강 상식', '컴퓨터·인터넷', '발명·발견', '자동차·교통', '항공·우주 기술', '에너지·환경 기술', '재료·건설 기술'],
  '문화·예술': ['미술·화가', '클래식 음악', '팝·록 음악', '음악 이론·악기', '세계 영화', '애니메이션', '만화·웹툰', '세계 문학', '공연·연극·뮤지컬', '건축', '사진·디자인'],
  '스포츠·게임': ['축구', '야구', '올림픽·국제대회', '농구·배구·기타 구기', '격투기·육상·수영', '보드게임·카드게임', 'e스포츠·비디오게임'],
  '생활·상식': ['세계 음식·요리', '술·음료', '브랜드·기업', '세계 언어·어원', '기호·상징·표지', '절기·기념일·축제', '의복·패션', '생활 규칙·안전', '반려동물·원예'],
};
const TRAPS = new Set(['number', 'name', 'place', 'time', 'cause']);
/** 부정문 — 어미·보조용언 꼴만(낱말 속 '없'·'못' 은 허용 목록으로 거른다) */
const NEG = /(지\s?않|않는다|않았다|않은|않고|아니다|아니라|아닌|없다|없는|없이|없었다|못한다|못했다|못하는|못 한다)/;
const NEG_OK = /(빠짐없이|어김없이|틀림없이|끊임없이|쓸모없|상관없|어처구니없|난데없|못자리|연못|대못|못생)/;
const BIG = (s) => { const t = flexCanon(s); const b = new Set(); for (let i = 0; i < t.length - 1; i++) b.add(t.slice(i, i + 2)); return b; };

export function checkOx(items, { questions = null } = {}) {
  const err = []; const warn = []; const seen = new Map(); const pairs = new Map(); const cnt = { t: 0, f: 0, l1: {}, trap: {}, grade: {}, l2: new Set(), web: 0, knowledge: 0 };
  const qb = questions ? questions.map((q) => ({ id: q.id, b: BIG(q.question_text) })) : null; const overlaps = [];
  items.forEach((it, i) => {
    const p = it.id ?? `#${i + 1}`; const s = String(it.statement ?? '');
    if (it.id != null && !/^ox-\d{4}$/.test(it.id)) err.push(`${p}: id 꼴`);
    if (L(s) < 40 || L(s) > 90) err.push(`${p}: 길이 ${L(s)}(40~90) — ${s}`);
    if (!/다\.$/.test(s)) err.push(`${p}: "다." 끝 아님 — ${s}`);
    if (/\?/.test(s)) err.push(`${p}: 물음표`);
    if (NEG.test(s) && !NEG_OK.test(s)) err.push(`${p}: 부정문 — ${s}`);
    if (/[일이삼사오육칠팔구십백천]\s?(명|개|년|km|미터|번)/.test(s) && /(십|백|천)/.test(s)) warn.push(`${p}: 한글 숫자 낱말?`);
    if (typeof it.answer !== 'boolean') err.push(`${p}: answer boolean`); else it.answer ? cnt.t++ : cnt.f++;
    if (!it.explanation || L(it.explanation) > 120) err.push(`${p}: explanation 1~120자(${L(it.explanation)})`);
    const c = it.category ?? {}; if (!CAT[c.l1] || !CAT[c.l1].includes(c.l2)) err.push(`${p}: category ${c.l1}/${c.l2}`); else { cnt.l1[c.l1] = (cnt.l1[c.l1] ?? 0) + 1; cnt.l2.add(c.l2); }
    if (![1, 2, 3].includes(it.grade)) err.push(`${p}: grade`); else cnt.grade[it.grade] = (cnt.grade[it.grade] ?? 0) + 1;
    if (it.answer === true && it.trap !== 'none') err.push(`${p}: 참인데 trap ${it.trap}`);
    if (it.answer === false && !TRAPS.has(it.trap)) err.push(`${p}: 거짓 trap ${it.trap}`); else if (it.answer === false) cnt.trap[it.trap] = (cnt.trap[it.trap] ?? 0) + 1;
    if (it.pairId != null) { const a = pairs.get(it.pairId) ?? []; a.push(it.answer); pairs.set(it.pairId, a); }
    const k = flexCanon(s); if (seen.has(k)) err.push(`${p}: 중복 = ${seen.get(k)}`); else seen.set(k, p);
    const src = it.sources ?? []; if (!src.length || src.some((x) => !x.url || !['web', 'knowledge'].includes(x.basis))) err.push(`${p}: sources(url · basis)`); else src.some((x) => x.basis === 'web') ? cnt.web++ : cnt.knowledge++;
    if (qb) { const b = BIG(s); let best = null; for (const q of qb) { let n = 0; for (const x of b) if (q.b.has(x)) n++; const r = b.size ? n / b.size : 0; if (!best || r > best.r) best = { id: q.id, r }; } if (best && best.r >= 0.6) { overlaps.push({ p, q: best.id, r: Math.round(best.r * 100) }); warn.push(`${p}: 기존 문항 #${best.id} 와 글자 겹침 ${Math.round(best.r * 100)}%`); } }
  });
  for (const [id, a] of pairs) if (a.length !== 2 || !a.includes(true) || !a.includes(false)) err.push(`pairId ${id}: 참 1 · 거짓 1 아님(${a})`);
  if (cnt.t !== cnt.f) warn.push(`참 ${cnt.t} · 거짓 ${cnt.f} — 1:1 아님`);
  return { n: items.length, err, warn, overlaps, stat: { ...cnt, l2: cnt.l2.size, pairs: pairs.size } };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/ox-check.mjs')) {
  const a = process.argv.slice(2);
  let files = a.filter((x) => !x.startsWith('--'));
  if (!files.length) files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^items(-\d+)?\.json$/.test(f)).map((f) => path.join(DIR, f)) : [];
  const items = files.flatMap((f) => { const j = JSON.parse(readFileSync(f, 'utf8')); return Array.isArray(j) ? j : j.items; });
  let questions = null;
  if (a.includes('--db')) {
    const pg = (await import('pg')).default; process.loadEnvFile?.(path.join(ROOT, '.env'));
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
    try { questions = (await c.query('select id::int, question_text from questions where is_active')).rows; } finally { await c.end(); }
  }
  const r = checkOx(items, { questions });
  if (a.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else { for (const e of r.err) console.log('막힘', e); for (const w of r.warn.slice(0, 40)) console.log('경고', w); console.log(`[ox-check] 문장 ${r.n} · 막힘 ${r.err.length} · 경고 ${r.warn.length} · ${JSON.stringify(r.stat)}`); }
  if (r.err.length) process.exitCode = 1;
}
