#!/usr/bin/env node
// =============================================================================
// G040 — 노래 1차 iTunes Search API(US 스토어) 조회 · 파일만 · DB 쓰기 없음 · 키 없는 공개 API(DG-063)
//   입력 data/pipeline/audit/g040-plan.json(items: {key, pool, title, artist, artistEn, titleEn?, year?, chart, sources})
//   캐시 data/pipeline/audit/g040-raw/itunes/<key>.json — 받은 검색 결과(재개 가능 · 있으면 다시 안 부름)
//   고르는 규칙(18 §10): artistName 이 가수(영문/한글)와 대응 · trackName 이 제목과 대응(못 대면 weak) · Instrumental/Inst./Remix/Live/Karaoke/Sped Up/Acoustic 판 제외
//     · previewUrl 있음 · year 가 있으면 releaseDate 연도 ±2 · 여러 판이면 가장 이른 releaseDate
//   검색어 순서: "<artist 한글> <title>" → "<artistEn> <title>" → "<artistEn> <titleEn>" — 3초 간격 · 403 이면 60초 쉼 · 호출 상한 --max(기본 600)
//   출력 data/pipeline/audit/g040-raw/itunes-picked.json
// 사용: node scripts/g040-itunes.mjs [--max 600]
// =============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUD = path.join(ROOT, 'data/pipeline/audit');
const CACHE = path.join(AUD, 'g040-raw/itunes'); mkdirSync(CACHE, { recursive: true });
const a = process.argv.slice(2); const MAX = a.includes('--max') ? Number(a[a.indexOf('--max') + 1]) : 600;
const UA = 'quiz-web-g040/1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
export const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const BAD = /\b(instrumental|inst\.?|remix|live|karaoke|sped up|acoustic|mr|backing track|cover|piano ver|orchestra)\b/i;

async function search(term) {
  for (let tryN = 0; tryN < 3; tryN++) {
    if (calls >= MAX) throw new Error('호출 상한');
    calls++; await sleep(3000);
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=US&media=music&entity=song&limit=10`, { headers: { 'User-Agent': UA } });
    if (r.status === 403 || r.status === 429) { console.log('  ', r.status, '— 60초 쉼'); await sleep(60000); continue; }
    if (!r.ok) return { error: r.status, results: [] };
    return await r.json();
  }
  return { error: 'retry', results: [] };
}

export function pick(it, results) {
  const an = [it.artist, it.artistEn, ...(it.artistAlt ?? [])].filter(Boolean).map(norm);
  const tn = [it.title, it.titleEn, ...(it.titleAlt ?? [])].filter(Boolean).map(norm);
  const ok = results.filter((x) => x.kind === 'song' && x.previewUrl && !BAD.test(`${x.trackName} ${x.collectionName ?? ''}`.replace(/\bLive\b(?= ?(in|at))/i, 'live')) && !BAD.test(x.trackName));
  const artistOk = (x) => { const n = norm(x.artistName); return an.some((s) => s && (n.includes(s) || s.includes(n))); };
  const titleOk = (x) => { const n = norm(x.trackName); return tn.some((s) => s && (n === s || n.includes(s) || (s.includes(n) && n.length >= 2))); };
  const Y = it.year ?? it.chart?.year; const yearOk = (x) => !Y || Math.abs(Number(String(x.releaseDate).slice(0, 4)) - Y) <= 2;
  const strong = ok.filter((x) => artistOk(x) && titleOk(x) && yearOk(x));
  const weak = ok.filter((x) => artistOk(x) && yearOk(x) && !titleOk(x));
  const byDate = (p, q) => String(p.releaseDate).localeCompare(String(q.releaseDate));
  if (strong.length) return { match: 'strong', x: strong.sort(byDate)[0] };
  if (weak.length === 1 || (weak.length && it.titleEn == null)) return { match: 'weak', x: weak[0], alts: weak.slice(0, 3).map((y) => y.trackName) }; // weak 는 검색 관련도 1순위(한글 검색어가 그 곡을 맨 앞에 둠 — 발매일 순은 다른 곡을 고름)
  return null;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/g040-itunes.mjs')) {
  const P = JSON.parse(readFileSync(path.join(AUD, 'g040-plan.json'), 'utf8'));
  const out = []; const miss = [];
  for (const it of P.items) {
    const f = path.join(CACHE, `${it.key}.json`);
    const cache = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { key: it.key, tries: [] };
    const terms = [...new Set([`${it.artist} ${it.title}`, it.artistEn && `${it.artistEn} ${it.title}`, it.artistEn && it.titleEn && `${it.artistEn} ${it.titleEn}`].filter(Boolean))];
    let got = null;
    for (const term of terms) {
      let tr = cache.tries.find((t) => t.term === term);
      if (!tr) { try { const j = await search(term); tr = { term, at: new Date().toISOString(), results: (j.results ?? []).map((x) => ({ kind: x.kind, trackId: x.trackId, trackName: x.trackName, artistName: x.artistName, collectionName: x.collectionName, previewUrl: x.previewUrl, artworkUrl100: x.artworkUrl100, releaseDate: x.releaseDate, primaryGenreName: x.primaryGenreName })) }; cache.tries.push(tr); writeFileSync(f, JSON.stringify(cache, null, 1)); } catch (e) { console.log('멈춤', e.message); break; } }
      got = pick(it, tr.results); if (got) { got.term = term; break; }
    }
    if (got) out.push({ key: it.key, match: got.match, term: got.term, alts: got.alts, itunes: got.x });
    else miss.push({ key: it.key, title: it.title, artist: it.artist, pool: it.pool, tried: terms.length });
    process.stdout.write(`\r${out.length + miss.length}/${P.items.length} · 호출 ${calls}   `);
    if (calls >= MAX) break;
  }
  writeFileSync(path.join(AUD, 'g040-raw/itunes-picked.json'), JSON.stringify({ at: new Date().toISOString(), calls, picked: out, miss }, null, 1) + '\n');
  console.log(`\n[g040-itunes] 고름 ${out.length}(strong ${out.filter((x) => x.match === 'strong').length} · weak ${out.filter((x) => x.match === 'weak').length}) · 못 찾음 ${miss.length} · 호출 ${calls}`);
}
