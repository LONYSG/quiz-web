// =============================================================================
// G061 — 노래 재분류 칸 검사 + 분포 (읽기 전용 · DB 0 · docs/18 §10 ★ R096 데이터 칸)
//   node scripts/g061-song.mjs          → 위반 목록 + 분포 표 · 위반 있으면 exit 1
// 칸: category(kr · pop · jpop) · genre(kr 필수 9종 · pop/jpop 선택) · titleKo(한글 · 숫자 · 기호만 · title 또는 titleVariants 에 있음)
//     legend(year < 2000 에만 · false 면 status inactive) · inactiveReason(inactive 면 필수)
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { songProblems } from './minigame-song.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(readFileSync(path.join(ROOT, 'data/minigame/song/items.json'), 'utf8'));
const CATS = ['kr', 'pop', 'jpop'];
const KR_GENRES = ['아이돌', '발라드', '댄스', '힙합', 'R&B', '록/밴드', 'OST', '트로트', '포크/인디'];
const OTHER_GENRES = { pop: ['팝', '록', '힙합', 'R&B', '댄스'], jpop: ['J-pop', '애니 OST'] };
const CAT_OF_POOL = { 'kpop-year': 'kr', 'kpop-classic': 'kr', pop: 'pop', jpop: 'jpop' };
const NON_HANGUL_LETTER = /[A-Za-zÀ-ɏ぀-ヿ一-鿿]/;

const bad = [];
const v = (it, why) => bad.push(`${it.id} ${it.title}: ${why}`);
const items = doc.items.filter((it) => it.status !== 'rejected');
for (const it of items) {
  if (!['verified', 'inactive', 'loaded'].includes(it.status)) v(it, `status ${it.status}`);
  if (!CATS.includes(it.category)) v(it, `category ${it.category}`);
  else if (CAT_OF_POOL[it.pool] !== it.category) v(it, `category ${it.category} ↔ pool ${it.pool}`);
  if (it.category === 'kr' && !KR_GENRES.includes(it.genre)) v(it, `kr genre ${it.genre}`);
  if (it.category !== 'kr' && it.genre !== null && !OTHER_GENRES[it.category]?.includes(it.genre)) v(it, `genre ${it.genre}`);
  if (typeof it.titleKo !== 'string' || !it.titleKo.trim()) v(it, 'titleKo 없음');
  else {
    if (NON_HANGUL_LETTER.test(it.titleKo)) v(it, `titleKo 비한글 ${it.titleKo}`);
    if (it.titleKo !== it.title && !it.titleVariants.includes(it.titleKo)) v(it, `titleKo 가 title · titleVariants 에 없음 ${it.titleKo}`);
    if (!NON_HANGUL_LETTER.test(it.title) && it.titleKo !== it.title) v(it, '한글 제목인데 titleKo ≠ title');
  }
  if (it.year >= 2000 && 'legend' in it) v(it, '21세기 곡에 legend 칸');
  if (it.year < 2000 && typeof it.legend !== 'boolean') v(it, '20세기 곡 legend 판정 없음');
  if (it.legend === true && !it.legendWhy) v(it, 'legend true 인데 legendWhy 없음');
  if (it.legend === false && it.status !== 'inactive') v(it, 'legend false 인데 활성');
  if (it.status === 'inactive' && !it.inactiveReason) v(it, 'inactive 인데 inactiveReason 없음');
  if (it.status !== 'inactive' && 'inactiveReason' in it) v(it, '활성인데 inactiveReason');
  const sp = songProblems(it);
  if (sp.length) v(it, `songProblems ${sp.join(' · ')}`);
}

// ── 분포
const dec = (y) => `${Math.floor(y / 10) * 10}`;
const DECS = ['1970', '1980', '1990', '2000', '2010', '2020'];
const table = (rows, keyOf, title) => {
  const m = new Map();
  for (const it of rows) {
    const k = keyOf(it);
    if (!m.has(k)) m.set(k, Object.fromEntries(DECS.map((d) => [d, 0])));
    m.get(k)[dec(it.year)] += 1;
  }
  console.log(`\n${title}\n  ${'칸'.padEnd(18)}${DECS.map((d) => d.padStart(6)).join('')}   합`);
  for (const [k, r] of [...m.entries()].sort()) console.log(`  ${k.padEnd(18)}${DECS.map((d) => String(r[d] || '·').padStart(6)).join('')}   ${Object.values(r).reduce((a, b) => a + b, 0)}`);
};
const active = items.filter((it) => it.status !== 'inactive');
console.log(`[g061-song] 전체 ${doc.items.length} · rejected ${doc.items.length - items.length} · 활성 ${active.length} · inactive ${items.length - active.length} · legend ${items.filter((i) => i.legend === true).length}/${items.filter((i) => i.year < 2000).length}`);
console.log(`  비한글 글자 섞인 제목(음차 필요) ${items.filter((i) => NON_HANGUL_LETTER.test(i.title)).length}`);
table(items, (it) => it.pool, '① pool × 연대 (재분류 전 — verified 292 전부)');
table(active, (it) => it.category, '② category × 연대 (활성만)');
table(active, (it) => `${it.category} ${it.genre ?? '-'}`, '③ category · genre × 연대 (활성만)');

if (bad.length) {
  console.log(`\n위반 ${bad.length}:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log('\n위반 0');
