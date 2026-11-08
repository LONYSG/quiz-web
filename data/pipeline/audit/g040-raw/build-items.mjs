// G040 D — data/minigame/song/items.json 만들기(18 §10 칸 전부 · status candidate)
//   고름: itunes-picked + override.json(GEN 이 캐시에서 바로잡은 것 · null = 빠짐) · kpop-year 는 연도마다 순위 순 8(빠진 자리는 예비) · 나머지 pool 은 계획 수만큼
//   year = iTunes releaseDate 연도(원곡 판을 고름 — 가장 이른 판 / 관련도 1순위) · 변형 = 기계(영문 trackName · 괄호 뺀 꼴 · 가수 영문) + JP 한글 제목
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { flexCanon } from '../../../../shared/dist/index.js';
const P = JSON.parse(readFileSync('data/pipeline/audit/g040-plan.json', 'utf8'));
const R = JSON.parse(readFileSync('data/pipeline/audit/g040-raw/itunes-picked.json', 'utf8'));
const OV = JSON.parse(readFileSync('data/pipeline/audit/g040-raw/override.json', 'utf8'));
const C = (s) => flexCanon(String(s ?? ''));
const cacheOf = (k) => JSON.parse(readFileSync(`data/pipeline/audit/g040-raw/itunes/${k}.json`, 'utf8'));
const picked = new Map(R.picked.map((p) => [p.key, p]));
for (const [k, v] of Object.entries(OV)) {
  if (v === null) { picked.delete(k); continue; }
  const x = cacheOf(k).tries.flatMap((t) => t.results).find((r) => r.trackId === v);
  picked.set(k, { key: k, match: 'gen', itunes: x });
}
const JPKO = { Pretender: '프리텐더', Lemon: '레몬', BETELGEUSE: '베텔기우스', '夜に駆ける': '밤을 달리다', 'アイドル': '아이돌', '残酷な天使のテーゼ': '잔혹한 천사의 테제', 'マリーゴールド': '마리골드', 'スパークル': '스파클', '悪魔の子': '악마의 아이', '青のすみか': '푸른 봄', 'シルエット': '실루엣', 'Lilac': '라일락', 'Dried Flower': '드라이 플라워', '真夜中のドア〜stay with me': '한밤중의 도어', '晩餐歌': '만찬가' };
const strip = (s) => String(s ?? '').replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();
const SPECIAL = /[^\p{L}\p{N} .·'\-&:!?,/~]/gu;
const clean = (v) => strip(v).replace(SPECIAL, '').replace(/\s+/g, ' ').trim();
const items = []; const dropped = []; const ambiguous = [];
const pools = { 'kpop-classic': [], pop: [], jpop: [] }; const years = {};
for (const it of P.items) {
  const p = picked.get(it.key);
  if (!p?.itunes) { dropped.push({ key: it.key, pool: it.pool, title: it.title, artist: it.artist, why: OV[it.key] === null ? 'GEN 대조 — 맞는 판 없음(MR · 다른 곡 · 재녹음만)' : 'iTunes US 에 없음(검색어 3개)' }); continue; }
  if (it.pool === 'kpop-year') (years[it.chart.year] ??= []).push({ it, p }); else pools[it.pool].push({ it, p });
}
const take = [];
for (const [y, arr] of Object.entries(years)) take.push(...arr.sort((a, b) => a.it.chart.rank - b.it.chart.rank).slice(0, 8));
const want = { 'kpop-classic': 40, pop: 60, jpop: 30 };
for (const [k, arr] of Object.entries(pools)) take.push(...arr.slice(0, want[k]));
const seenT = new Set(); let n = 0;
for (const { it, p } of take) {
  const t = p.itunes; const y = Number(String(t.releaseDate).slice(0, 4));
  if (it.pool === 'kpop-classic' && y > 2004) { dropped.push({ key: it.key, pool: it.pool, title: it.title, why: `발매 ${y} — 국민가요(2004 이전) 밖` }); continue; }
  if (seenT.has(C(it.title))) { dropped.push({ key: it.key, title: it.title, why: '같은 제목' }); continue; } seenT.add(C(it.title));
  const tv = new Set(); const av = new Set();
  for (const v of [clean(t.trackName), clean(it.title), it.rawTitle && clean(it.rawTitle), JPKO[it.title]]) if (v && C(v) !== C(it.title)) tv.add(v);
  for (const v of [it.artistEn, clean(t.artistName)]) if (v && C(v) !== C(it.artist) && !/[,&]/.test(v)) av.add(clean(v));
  if (p.match !== 'strong') ambiguous.push({ key: it.key, title: it.title, artist: it.artist, trackName: t.trackName, artistName: t.artistName, match: p.match });
  items.push({ id: `song-${String(++n).padStart(4, '0')}`, status: 'candidate', createdRound: 'G040', title: it.title, titleVariants: [...tv], artist: it.artist, artistVariants: [...av], year: y,
    itunes: { trackId: t.trackId, country: 'US', trackName: t.trackName, artistName: t.artistName, collectionName: t.collectionName, previewUrl: t.previewUrl, previewSec: 30, artworkUrl100: t.artworkUrl100, releaseDate: t.releaseDate, fetchedAt: '2026-11-08' },
    pool: it.pool, chart: it.chart ?? null, qid: null, sources: it.sources.map((s) => ({ ...s, fetchedAt: '2026-11-08' })), tags: [it.pool, it.decade ? `${it.decade}년대` : `${Math.floor(y / 10) * 10}년대`, t.primaryGenreName].filter(Boolean), verify: null });
}
mkdirSync('data/minigame/song', { recursive: true });
writeFileSync('data/minigame/song/items.json', JSON.stringify({ game: 'song', version: 1, asOf: '2026-11-08', items }, null, 1) + '\n');
writeFileSync('data/pipeline/audit/g040-raw/result.json', JSON.stringify({ at: new Date().toISOString(), n: items.length, dropped, ambiguous }, null, 1) + '\n');
const bp = {}; for (const i of items) bp[i.pool] = (bp[i.pool] ?? 0) + 1;
console.log('items', items.length, bp, 'dropped', dropped.length, 'ambiguous', ambiguous.length);
