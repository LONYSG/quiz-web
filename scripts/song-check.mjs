#!/usr/bin/env node
// =============================================================================
// G040 — 노래 데이터 기계 검사(docs/18 §10) — data/minigame/song/items*.json
//   막힘: 머리(game · version · asOf · items) · 항목 칸 · id 꼴(song-NNNN · 파일 합쳐 유일) · status · title/artist 빈칸 · year 정수(1950~올해)
//        · itunes{trackId · previewUrl · trackName · artistName · releaseDate · country US} · pool 값 · 제목 정규화 중복 0 · 같은 가수 6곡 넘음
//        · Instrumental/Inst./Remix/Live/Karaoke/Sped Up 판 · 변형 특수문자
//   경고: releaseDate 연도와 year 차 > 2(다른 판본 의심) · titleVariants · artistVariants 가 다른 곡과 겹침 · chart 칸 꼴
//   요약: pool 별 수 · 연도별 kpop-year 수
// 사용: node scripts/song-check.mjs [--json]
// =============================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/song');
const C = (s) => flexCanon(String(s ?? ''));
const POOLS = new Set(['kpop-year', 'kpop-classic', 'pop', 'jpop']);
const STATUS = new Set(['candidate', 'verified', 'rejected', 'loaded']);
const BAD = /\b(instrumental|inst\.|remix|live|karaoke|sped up)\b/i;
const SPECIAL = /[^\p{L}\p{N} .·'\-&:!?,/~]/u;
const KEYS = new Set(['id', 'status', 'createdRound', 'title', 'titleVariants', 'artist', 'artistVariants', 'year', 'itunes', 'pool', 'chart', 'qid', 'sources', 'tags', 'verify']);

export function checkSongs(files) {
  const err = []; const warn = []; const all = [];
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (j.game !== 'song' || !Number.isInteger(j.version) || !/^\d{4}-\d{2}-\d{2}$/.test(j.asOf ?? '') || !Array.isArray(j.items)) err.push(`${path.basename(f)}: 머리(game song · version · asOf · items)`);
    all.push(...(j.items ?? []));
  }
  const ids = new Set(); const titles = new Map(); const byArtist = new Map(); const vmap = new Map(); const thisYear = new Date().getFullYear();
  for (const it of all) {
    const p = it.id ?? '?';
    if (!/^song-\d{4}$/.test(it.id ?? '')) err.push(`${p}: id 꼴`); if (ids.has(it.id)) err.push(`${p}: id 겹침`); ids.add(it.id);
    for (const k of Object.keys(it)) if (!KEYS.has(k)) err.push(`${p}: 모르는 칸 ${k}`);
    for (const k of KEYS) if (!(k in it)) err.push(`${p}: 칸 없음 ${k}`);
    if (!STATUS.has(it.status)) err.push(`${p}: status`);
    if (!String(it.title ?? '').trim() || !String(it.artist ?? '').trim()) err.push(`${p}: title · artist`);
    if (!Number.isInteger(it.year) || it.year < 1950 || it.year > thisYear) err.push(`${p}: year`);
    if (!POOLS.has(it.pool)) err.push(`${p}: pool ${it.pool}`);
    const t = it.itunes ?? {};
    if (!t.trackId || !t.previewUrl || !t.trackName || !t.artistName || !t.releaseDate || t.country !== 'US') err.push(`${p}: itunes 칸(trackId · previewUrl · trackName · artistName · releaseDate · country US)`);
    if (BAD.test(t.trackName ?? '')) err.push(`${p}: 판본 ${t.trackName}`);
    if (t.releaseDate && Number.isInteger(it.year) && Math.abs(Number(String(t.releaseDate).slice(0, 4)) - it.year) > 2) warn.push(`${p}: releaseDate ${String(t.releaseDate).slice(0, 4)} ↔ year ${it.year}`);
    const tc = C(it.title); if (titles.has(tc)) err.push(`${p}: 제목 겹침 '${it.title}' = ${titles.get(tc)}`); else titles.set(tc, p);
    const a = C(it.artist); byArtist.set(a, (byArtist.get(a) ?? 0) + 1);
    for (const v of [...(it.titleVariants ?? []), ...(it.artistVariants ?? [])]) { if (typeof v !== 'string' || !v.trim()) err.push(`${p}: 빈 변형`); else if (SPECIAL.test(v)) err.push(`${p}: 변형 특수문자 '${v}'`); }
    for (const v of it.titleVariants ?? []) { const c = C(v); if (vmap.has(c) && vmap.get(c) !== p) warn.push(`${p}: 제목 변형 '${v}' ↔ ${vmap.get(c)}`); vmap.set(c, p); }
    if (it.chart != null && (typeof it.chart !== 'object' || !it.chart.source || !Number.isInteger(it.chart.year) || !Number.isInteger(it.chart.rank))) warn.push(`${p}: chart 꼴`);
  }
  for (const [a, n] of byArtist) if (n > 6) err.push(`같은 가수 ${n}곡: ${a}`);
  const pools = {}; const years = {}; for (const it of all) { pools[it.pool] = (pools[it.pool] ?? 0) + 1; if (it.pool === 'kpop-year') years[it.chart?.year] = (years[it.chart?.year] ?? 0) + 1; }
  return { n: all.length, err, warn, pools, years };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/song-check.mjs')) {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^items(-\d+)?\.json$/.test(f)).sort().map((f) => path.join(DIR, f)) : [];
  const r = checkSongs(files);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    for (const e of r.err) console.log('막힘', e); for (const w of r.warn.slice(0, 30)) console.log('경고', w); if (r.warn.length > 30) console.log(`경고 … 외 ${r.warn.length - 30}`);
    console.log(`[song-check] 곡 ${r.n} · 막힘 ${r.err.length} · 경고 ${r.warn.length} · pool ${JSON.stringify(r.pools)} · kpop-year 연도별 ${JSON.stringify(r.years)}`);
  }
  if (r.err.length) process.exitCode = 1;
}
