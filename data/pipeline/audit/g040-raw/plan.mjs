// G040 B — g040-plan.json 만들기: 연도마다 앞에서 8(같은 제목은 앞 연도만 · 같은 가수 판 전체 6곡) + 예비(다음 순위) · classic 40 · pop 60 · jpop 30
//   --with-reserve <key,key> : iTunes 에서 빠진 곡 자리를 같은 연도 예비로 채움(2단계)
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { YE, CLASSIC, POP, JPOP, AE, SRC } from './plan-src.mjs';
const MORE = { 'gavy nj': 'Gavy NJ', '하동균': 'Ha Dong Kyun', '신혜성, 린': 'Shin Hye Sung & Lyn', '테이': 'Tei', '브라운 아이즈': 'Brown Eyes', '먼데이 키즈': 'Monday Kiz', '아웃사이더': 'Outsider',
  '카라': 'KARA', 'EXO': 'EXO', '씨스타19': 'SISTAR19', '범키': 'Bumkey', 'EXID': 'EXID', '수란': 'SURAN', 'WINNER': 'WINNER', '청하': 'CHUNG HA', '레드벨벳': 'Red Velvet', 'MSG워너비': 'MSG Wannabe', 'BIG Naughty': 'BIG Naughty', '마크툽': 'MAKTUB',
  '빅뱅, 2NE1': 'BIGBANG & 2NE1',
  '이광조': 'Lee Kwang Jo', '시인과 촌장': 'Poet And The Village Chief', '신형원': 'Shin Hyung Won', '김광석': 'Kim Kwang Seok', '들국화': 'Deulgukhwa', '이선희': 'Lee Sun Hee', '이문세': 'Lee Moon Sae', '김범룡': 'Kim Bum Ryong', '배따라기': 'Baettaragi', '조덕배': 'Cho Duk Bae',
  '김현식': 'Kim Hyun Sik', '한동준': 'Han Dong Joon', '015B': '015B', '윤상': 'Yoon Sang', '엄정화': 'Uhm Jung Hwa', '안치환': 'Ahn Chi Hwan', '넥스트': 'N.EX.T', '김수희': 'Kim Soo Hee', '이승환': 'Lee Seung Hwan', '변진섭': 'Byun Jin Sub', '김건모': 'Kim Gun Mo', '김종환': 'Kim Jong Hwan', '김민우': 'Kim Min Woo', '패닉': 'Panic', '부활': 'Boohwal', '전람회': 'Exhibition', '신승훈': 'Shin Seung Hun', '김경호': 'Kim Kyung Ho',
  '보아': 'BoA', '포지션': 'Position', 'god': 'g.o.d', '조성모': 'Jo Sung Mo', '휘성': 'Wheesung', 'SE7EN': 'SE7EN', '빅마마': 'Big Mama', '코요태': 'Koyote' };
const EN = (a) => AE[a] ?? MORE[a] ?? null;
const N = (s) => String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const first = (a) => a.split(',')[0].trim();
const items = []; const seenT = new Set(); const cnt = new Map(); const reserve = [];
const add = (it) => { items.push(it); seenT.add(N(it.title)); const k = first(it.artist); cnt.set(k, (cnt.get(k) ?? 0) + 1); };
// classic · pop · jpop 먼저 세지 않고 kpop-year 를 먼저(차트가 정본) — 단 같은 제목은 kpop-year 우선
for (const [y, rows] of Object.entries(YE)) {
  let n = 0;
  rows.forEach(([title, artist, raw], i) => {
    const it = { key: `y${y}-${String(i + 1).padStart(2, '0')}`, pool: 'kpop-year', title, artist, artistEn: EN(artist), chart: { source: '멜론 연간', year: Number(y), rank: i + 1 }, rawTitle: raw ?? null, sources: [{ url: SRC.M(y), note: `멜론 연도별 차트 ${y} ${i + 1}위` }] };
    const why = seenT.has(N(title)) ? '같은 제목 앞 연도' : (cnt.get(first(artist)) ?? 0) >= 6 ? '같은 가수 6곡' : null;
    if (n < 8 && !why) { add(it); n++; } else reserve.push({ ...it, why: why ?? '9위 아래 예비' });
  });
}
for (const [title, artist, url, dec] of CLASSIC) { if (seenT.has(N(title))) { reserve.push({ title, artist, why: '같은 제목(kpop-year)' }); continue; } add({ key: `c${dec}-${N(title).slice(0, 12)}`, pool: 'kpop-classic', title, artist, artistEn: EN(artist), chart: null, decade: Number(dec), sources: [{ url, note: `멜론 연대별 차트 ${dec}년대` }] }); }
for (const [title, artist, url, dec] of POP) add({ key: `p${dec}-${N(title).slice(0, 14)}`, pool: 'pop', title, artist: artist, artistEn: artist, titleEn: title, chart: null, decade: Number(dec), sources: [{ url, note: `멜론 연대별 해외 POP ${dec}년대` }] });
for (const [title, artistEn, artistKo] of JPOP) add({ key: `j-${N(title).slice(0, 14) || N(artistEn)}`, pool: 'jpop', title, artist: artistKo, artistEn, chart: null, sources: [{ url: SRC.JP, note: '멜론 장르 J-POP 인기 목록(한국 사용자)' }] });
const keys = new Set(); for (const it of items) { if (keys.has(it.key)) it.key += '-2'; keys.add(it.key); }
const byPool = {}; for (const it of items) byPool[it.pool] = (byPool[it.pool] ?? 0) + 1;
writeFileSync('data/pipeline/audit/g040-plan.json', JSON.stringify({ round: 'G040', at: new Date().toISOString(), counts: { ...byPool, total: items.length, reserve: reserve.length }, items, reserve }, null, 1) + '\n');
console.log(byPool, items.length, 'reserve', reserve.length, 'noEn', items.filter((x) => !x.artistEn).map((x) => x.artist).join(','));
const top = [...cnt].sort((p, q) => q[1] - p[1]).slice(0, 6); console.log(top);
