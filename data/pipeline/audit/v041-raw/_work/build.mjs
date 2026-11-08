// V041 — 293 판정 → audit/v041-song.json (items.json 은 안 건드림)
import { readFileSync, writeFileSync } from 'node:fs';
const items = JSON.parse(readFileSync('data/minigame/song/items.json', 'utf8')).items;
const head = JSON.parse(readFileSync('data/pipeline/audit/v041-raw/head.json', 'utf8'));
const chart = JSON.parse(readFileSync('data/pipeline/audit/v041-raw/chart-verify.json', 'utf8'));
const amb = JSON.parse(readFileSync('data/pipeline/audit/g040-raw/result.json', 'utf8')).ambiguous;
const weak = new Set(amb.map((a) => a.title + '|' + a.artist));
const H = (s) => /[가-힣]/.test(s);
const MELON = (y) => `https://www.melon.com/chart/age/list.htm?idx=1&chartType=YE&chartGenre=KPOP&chartDate=${y}&moved=Y`;
const IT = (id) => `https://itunes.apple.com/lookup?id=${id}&country=US`;

// ── 블로킹 수정(status candidate 그대로 · proposal) ──
const TRACK = {
  '0009': { trackId: 1647285582, name: 'Partner for Life', coll: 'The 3rd Masterpiece', rd: '2006-04-11', why: '「내사람 (Ivy Mix)」 = 「Ivy Mega Mix 2006」 리믹스 모음집 곡 → 원곡 판으로', cat: 'version-remix' },
  '0011': { trackId: 1656854205, name: 'Scent of a Woman', coll: 'Scent of a Woman', rd: '2006-02-22', why: '「여인의 향기 (Ivy Mix)」 리믹스 모음집 곡 → 원곡 판으로', cat: 'version-remix' },
  '0027': { trackId: 365430197, name: 'Love', coll: 'With L.O.V.E Brown Eyed Girls', rd: '2008-01-17', year: 2008, why: '다른 곡 — 고른 판은 「Must Have Love」(브아걸 & SG워너비 · 2006-11 싱글)인데 멜론 2008 연간 3위는 브아걸 「Love」(2008-01 발매) → 올바른 판으로 · year 2006 → 2008 · titleVariants 의 "Must Have Love" 빼기', cat: 'wrong-song' },
  '0053': { trackId: 1338689928, name: 'Ugly', coll: '2NE1 2nd Mini Album - EP', rd: '2011-07-28', why: '「Ugly (JP Ver.)」 = 일본어 판 → 한국어 원곡 판으로', cat: 'version-language' },
  '0174': { trackId: 1619946631, name: '그댄 봄비를 무척 좋아하나요', coll: '창밖의 낙엽은 그대론데 / 회상', rd: '1990-02-01', why: '「(경음악)」 = 연주(Instrumental) 판 → 노래 판으로(year 1985 는 원곡 연도라 그대로)', cat: 'version-instrumental' },
  '0184': { trackId: 1728633018, name: 'Excuses', coll: 'Excuses', rd: '1993-10-01', why: '「(2024 Remaster)」 → 1993 원판(리마스터 꼴 0 — 18 §10)', cat: 'version-remaster' },
  '0188': { trackId: 1728627771, name: 'Wrongful Meeting', coll: 'Wrongful Meeting', rd: '1995-01-24', why: '「(2024 Remaster)」 → 1995 원판', cat: 'version-remaster' },
  '0200': { trackId: 1061503105, name: 'Atlantis Princess', coll: 'Atlantis Princess - The 3rd Album', rd: '2003-05-30', why: '「아틀란티스 소녀 (Just Fiction 2003 Mix)」 = 리믹스(Rock With You EP) → 3집 원곡 판으로', cat: 'version-remix' },
  '0238': { trackId: 157390097, name: 'I Knew I Loved You', coll: 'Affirmation', rd: '1999-09-28', why: '「(7" Mini Me Mix)」 믹스 판 → 원곡 판으로', cat: 'version-remix' },
  '0240': { trackId: 1440757476, name: 'Because of You', coll: 'Because of You', rd: '2007-03-27', why: '「(Josh Harris Radio Edit)」 = 리믹서 편집 판(Remixes EP) → 원곡 판으로', cat: 'version-remix' },
  '0243': { trackId: 1440818665, name: 'Poker Face', coll: 'The Fame', rd: '2008-08-19', why: '「(Glam As You Radio Mix)」 = 리믹스(Remixes EP) → 앨범 원곡 판으로', cat: 'version-remix' },
  '0120': { trackId: 1649505183, name: 'To You My Light', coll: 'SPACE OPERA (Red Moon : Complete Edition)', rd: '2019-06-09', why: '「To You My Light (2022)」 = 2022 판 표기(원곡 2019 — 멜론 2019 연간 10위) → 2019 원곡 판으로. 근거 약함(앨범이 Complete Edition 모음집) — G043 이 lookup 으로 원판 확인', cat: 'version-other', weakEvidence: true },
};
const YEAR = {
  '0015': { year: 2006, why: 'year 2004 → 2006: 바이브 「그 남자 그 여자」(feat. 장혜진)는 3집 2006 싱글(en.wiki Vibe · 멜론 2006 연간 8위). iTunes releaseDate 2004-07-29 는 믿을 수 없음(같은 판의 collectionName Re - Feel · 차트 연도가 2006)' },
  '0228': { year: 1996, why: 'year 1995 → 1996: 고른 판은 사라 브라이트만 & 보첼리 듀엣(1996-09 싱글 — en.wiki Con te partirò). 1995 는 보첼리 솔로 「Con te partirò」(산레모) 연도' },
};
const CHART = {}; // 순위 어긋남 — 비블로킹
for (const [id, c] of Object.entries(chart)) {
  const m = c.rec.match(/(\d+)#(\d+)/); const hit = c.found.map((f) => +f.split(':')[0]);
  if (hit.length && !hit.includes(+m[2])) CHART[id.slice(5)] = hit[0];
}
CHART['0117'] = 7; // 사계 — 태연 7위(엠씨더맥스 「사계」 19위와 구분)
const KEEP = new Set(['0026', '0040', '0054', '0057', '0081', '0085', '0102', '0105', '0108', '0114', '0121', '0124', '0129', '0132', '0136', '0150', '0152', '0153', '0158']);
const KO = { KCM: '케이씨엠', '2NE1': '투애니원', 'G-DRAGON': '지드래곤', '2PM': '투피엠', '2AM': '투에이엠', iKON: '아이콘', aespa: '에스파', IVE: '아이브', 'BIG Naughty': '빅나티', NewJeans: '뉴진스', TWS: '투어스', DAY6: '데이식스', QWER: '큐더블유이알', WOODZ: '우즈', '10CM': '십센치', '015B': '공일오비', god: '지오디', SE7EN: '세븐',
  Berlin: '베를린', 'Stevie Wonder': '스티비 원더', 'The Police': '더 폴리스', 'Richard Marx': '리처드 막스', 'Barbra Streisand': '바브라 스트라이샌드', 'Glenn Medeiros': '글렌 메데이로스', 'REO Speedwagon': '알이오 스피드웨건', 'Lipps Inc.': '립스 인크', 'Lionel Richie': '라이오넬 리치', 'Chris de Burgh': '크리스 디 버그', Chicago: '시카고', 'Irene Cara': '아이린 카라', 'Joan Jett & the Blackhearts': '조안 제트', 'Michael Jackson': '마이클 잭슨', 'Céline Dion': '셀린 디온', 'Whitney Houston': '휘트니 휴스턴', 'Savage Garden': '세비지 가든', "Sinéad O'Connor": '시네이드 오코너', UB40: '유비포티', 'Bryan Adams': '브라이언 아담스', 'Andrea Bocelli': '안드레아 보첼리', 'Puff Daddy': '퍼프 대디', 'Eric Clapton': '에릭 클랩튼', 'Peabo Bryson': '피보 브라이슨', 'Jason Mraz': '제이슨 므라즈', Beyoncé: '비욘세', Santana: '산타나', 'Kylie Minogue': '카일리 미노그', OutKast: '아웃캐스트', 'Ne-Yo': '니요', Usher: '어셔', Ashanti: '아샨티', 'Lady Gaga': '레이디 가가', 'Britney Spears': '브리트니 스피어스', 'Alicia Keys': '알리샤 키스', 'Christina Aguilera': '크리스티나 아길레라', Dido: '디도', 'Maroon 5': '마룬 파이브', 'Sam Smith': '샘 스미스', 'Ed Sheeran': '에드 시런', 'Adam Levine': '애덤 르빈', 'Justin Bieber': '저스틴 비버', Adele: '아델', 'Mark Ronson': '마크 론슨', 'Camila Cabello': '카밀라 카베요', 'Fitz and The Tantrums': '피츠 앤 더 탠트럼스', 'Anne-Marie': '앤 마리', 'The Chainsmokers': '체인스모커스', 'Wiz Khalifa': '위즈 칼리파', 'Ariana Grande': '아리아나 그란데', 'Kool & The Gang': '쿨 앤 더 갱', 'Cyndi Lauper': '신디 로퍼' };
const NOTE = {
  '0115': "「넘쳐흘러」 = \"After You've Gone\" 확인(en.wiki MC the Max discography · Circular 2019-01 · 가온 1위) — G040 의 약한 대응이 맞음",
  '0031': '멜론 2008 연간 7위 곡명이 「사랑과 전쟁 (Narr. 하하)」 — 나레이션 판이 곧 차트곡이라 판본 문제 아님',
  '0236': '「Radio Mix」 = 앨범 곡의 싱글 편집(리믹서 판 아님) — 통과 · year 1999(앨범 1999-06 · 싱글 2000) ±1 메모',
  '0247': 'year 1998(영화 Sliding Doors 사운드트랙 첫 수록) vs 대중 인지 2000(싱글 2000-09) — 통과 · 연도 기준 메모(CV-169)',
  '0213': 'year 1979 — 앨범 Mouth to Mouth 1979 · 싱글 1980 ±1 메모',
  '0180': 'year 1993 — 1집 Home 은 1992 발매 가능성(웹으로 확정 못 함) ±1 메모',
  '0201': 'year 2002 — 웹으로 확정 못 함(unsure)',
  '0284': "「Director's Edit Version」 = 에반게리온 TV 오프닝 컷 — 같은 녹음의 편집, 통과(메모)",
  '0286': '「Movie Ver.」 = 영화 〈너의 이름은〉 삽입 녹음 = 원곡 — 통과',
  '0273': 'jpop 인지도 근거 약함(Novelbright — 한국 차트 이력 확인 못 함) — 메모 · status 는 안 내림',
  '0292': 'jpop 인지도 근거 약함(natori Propose 2025 — 한국 차트 이력 확인 못 함) — 메모',
  '0255': '고른 판이 Remixes EP 수록이나 곡명이 원곡 그대로 — 통과 · 앨범 Uptown Special 판(trackId 943946671 · 2014-11-10)이 더 깔끔 — 비블로킹 제안',
  '0159': '고른 판이 Remixes EP 수록이나 곡명이 원곡("To. X") 그대로 — 통과 · 5th Mini Album 판(trackId 1717568642) 제안 — 비블로킹',
};
const out = {}; const itemsOut = [];
for (const it of items) {
  const n = it.id.slice(5); const isW = weak.has(it.title + '|' + it.artist);
  const h = head[it.id]; const headOk = h && (h.status === 200 || h.status === 206);
  const checked = [`previewUrl HEAD ${h ? h.status : '?'}${h?.type ? ' ' + h.type : ''}`, `대응 ${isW ? 'weak→눈 전수 대조' : 'strong→눈 대조'}(${it.itunes.trackName} ↔ ${it.title} · ${it.itunes.artistName} ↔ ${it.artist})`, `releaseDate ${it.itunes.releaseDate.slice(0, 4)} ↔ year ${it.year}`];
  if (it.chart) checked.push(`멜론 ${it.chart.year} 연간 ${it.chart.rank}위 ↔ 페이지 ${chart[it.id]?.found.join(' / ') || '없음'}`);
  const sources = [{ url: IT(it.itunes.trackId), basis: 'web', note: 'iTunes lookup/캐시' }];
  if (it.chart) sources.push({ url: MELON(it.chart.year), basis: 'web', note: '멜론 연도별 차트 페이지(받아서 대조)' });
  const fixes = []; let verdict = 'ok'; let status = 'verified'; let cat = 'ok'; let proposal = null; let reason = '미리듣기 200 · 곡 대응 일치 · 연도 이상 없음 · 판본 이상 없음';
  if (!headOk) { verdict = 'drop'; status = 'rejected'; cat = 'preview'; reason = `미리듣기 HEAD ${h?.status}`; }
  if (TRACK[n]) { const t = TRACK[n]; verdict = 'fix'; status = 'candidate'; cat = t.cat; reason = t.why; proposal = { trackId: t.trackId, trackName: t.name, collectionName: t.coll, releaseDate: t.rd, ...(t.year ? { year: t.year } : {}), lookup: IT(t.trackId) }; fixes.push(`trackId → ${t.trackId} (${t.name} · ${t.coll} · ${t.rd})` + (t.year ? ` · year ${t.year}` : '')); }
  if (YEAR[n]) { const y = YEAR[n]; verdict = 'fix'; status = 'candidate'; cat = 'year'; reason = y.why; proposal = { year: y.year }; fixes.push(`year → ${y.year}`); }
  if (n === '0006') { verdict = 'drop'; status = 'rejected'; cat = 'version-remix'; reason = '「세글자」 원곡(엠투엠 2005 · 멜론 2005 연간 6위)은 iTunes US 에 없고 「Ivy Mix」(Ivy Mega Mix 2006 리믹스 모음)뿐 — 믹스 판은 못 씀. 빼거나 같은 연도 다음 순위로 대체'; proposal = null; }
  const minor = [];
  if (CHART[n] !== undefined && it.chart) minor.push(`chart.rank ${it.chart.rank} → ${CHART[n]} (멜론 ${it.chart.year} 연간 페이지 실제 순위)`);
  const rm = H(it.title) && !KEEP.has(n) ? it.titleVariants.filter((v) => /[A-Za-z]/.test(v)) : [];
  if (n === '0027') rm.push('Must Have Love');
  if (rm.length) minor.push(`titleVariants 에서 빼기(실제로 안 치는 영문 번역): ${[...new Set(rm)].join(' / ')}`);
  const ko = KO[it.artist]; if (ko && !it.artistVariants.includes(ko)) minor.push(`artistVariants 에 보탬: ${ko}${n === '0228' ? ' / Sarah Brightman / 사라 브라이트만' : ''}`);
  if (n === '0228' && !ko) minor.push('artistVariants 에 보탬: Sarah Brightman / 사라 브라이트만');
  if (n === '0011') minor.push('titleVariants 에 보탬: Scent of a Woman');
  if (n === '0200') minor.push('titleVariants 에 보탬: Atlantis Princess');
  if (NOTE[n]) minor.push(NOTE[n]);
  out[it.id] = { id: it.id, verdict, status, category: cat, proposal, reason, fixes, minor, weak: isW, head: h ?? null, sources, basis: cat === 'ok' ? 'web+knowledge' : 'web' };
  itemsOut.push({ id: it.id, status, verify: { round: 'V041', checkedAt: new Date().toISOString(), verdict, reason, proposal, checked, ...(fixes.length ? { fixes } : {}), ...(minor.length ? { notes: minor } : {}) } });
}
writeFileSync('data/pipeline/audit/v041-song.json', JSON.stringify(out, null, 1) + '\n');
writeFileSync('data/pipeline/audit/v041-raw/_work/items-verify.json', JSON.stringify(itemsOut));
const c = {}; for (const o of Object.values(out)) { const k = o.verdict + '/' + o.status; c[k] = (c[k] || 0) + 1; } console.log(c);
const cat2 = {}; for (const o of Object.values(out)) cat2[o.category] = (cat2[o.category] || 0) + 1; console.log(cat2);
console.log('minor', Object.values(out).filter((o) => o.minor.length).length, 'chartfix', Object.keys(CHART).length, 'noHead', items.filter((i) => !head[i.id]).length);
