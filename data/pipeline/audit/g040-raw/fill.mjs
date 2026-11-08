// G040 C 2단계 — 빠진 곡 자리 채우기: kpop-year = 같은 연도 예비(다음 순위 · 최대 2) · 나머지 = 같은 페이지 다른 곡
import { readFileSync, writeFileSync } from 'node:fs';
const P = JSON.parse(readFileSync('data/pipeline/audit/g040-plan.json', 'utf8'));
const R = JSON.parse(readFileSync('data/pipeline/audit/g040-raw/itunes-picked.json', 'utf8'));
const OV = JSON.parse(readFileSync('data/pipeline/audit/g040-raw/override.json', 'utf8'));
const missKeys = new Set([...R.miss.map((m) => m.key), ...Object.entries(OV).filter(([, v]) => v === null).map(([k]) => k)]);
const AG = (g, d) => `https://www.melon.com/chart/age/list.htm?idx=1&chartType=AG&chartGenre=${g}&chartDate=${d}&moved=Y`;
const JP = 'https://www.melon.com/genre/song_list.htm?gnrCode=GN1900&orderBy=POP';
const ALT = {
  'kpop-classic': [['나도야 간다', '김수철', 'Kim Soo Chul', 1980], ['눈물의 파티', '조용필', 'Cho Yong Pil', 1980], ['그날', '김연숙', 'Kim Yeon Sook', 1980], ['시청 앞 지하철 역에서', '동물원', 'Dongmulwon', 1990], ['정말 사랑했을까', '브라운 아이드 소울', 'Brown Eyed Soul', 2000], ['사랑..그게 뭔데', '양파', 'Yangpa', 2000]],
  pop: [['Celebration', 'Kool & The Gang', 1980], ['Time After Time', 'Cyndi Lauper', 1980], ['Open Arms', 'Journey', 1980]],
  jpop: [['Sakayume', 'King Gnu', '킹 누'], ['Tokyo Flash', 'Vaundy', '바운디'], ['Propose', 'natori', '나토리'], ['Leo', 'Yuuri', '유우리'], ['NIGHT RUNNER', 'YOASOBI', '요아소비']],
};
const add = []; const used = new Set(P.items.map((i) => i.key));
const need = {}; for (const it of P.items) if (missKeys.has(it.key)) { const k = it.pool === 'kpop-year' ? `y${it.chart.year}` : it.pool; need[k] = (need[k] ?? 0) + 1; }
for (const [k, n] of Object.entries(need)) {
  if (k.startsWith('y')) { const y = Number(k.slice(1)); const res = P.reserve.filter((r) => r.chart?.year === y && r.why === '9위 아래 예비' && !used.has(r.key)).slice(0, n + 1); for (const r of res) { add.push({ ...r, fill: true }); used.add(r.key); } }
  else for (const a of ALT[k].slice(0, n + 1)) {
    if (k === 'kpop-classic') add.push({ key: `c${a[3]}-alt-${a[0]}`, pool: k, title: a[0], artist: a[1], artistEn: a[2], chart: null, decade: a[3], sources: [{ url: AG('KPOP', a[3]), note: `멜론 연대별 차트 ${a[3]}년대` }], fill: true });
    else if (k === 'pop') add.push({ key: `p${a[2]}-alt-${a[0]}`, pool: k, title: a[0], artist: a[1], artistEn: a[1], titleEn: a[0], chart: null, decade: a[2], sources: [{ url: AG('POP', a[2]), note: `멜론 연대별 해외 POP ${a[2]}년대` }], fill: true });
    else add.push({ key: `j-alt-${a[0]}`, pool: k, title: a[0], artist: a[2], artistEn: a[1], chart: null, sources: [{ url: JP, note: '멜론 장르 J-POP 인기 목록(한국 사용자)' }], fill: true });
  }
}
P.items.push(...add.map(({ why, ...x }) => x)); P.fill = { need, added: add.length };
writeFileSync('data/pipeline/audit/g040-plan.json', JSON.stringify(P, null, 1) + '\n'); console.log(need, 'added', add.length);
