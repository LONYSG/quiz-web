#!/usr/bin/env node
// =============================================================================
// dict-check — 표준국어대사전(국립국어원 오픈 API)에 낱말이 표제어로 있는지 묻는다 (G101 · 2026-11-18)
//   키   .env 의 STDICT_API_KEY (값은 화면 · 로그 · 파일에 찍지 않는다 · 캐시에는 낱말만 남긴다)
//   요청 https://stdict.korean.go.kr/api/search.do?q=<낱말>&req_type=json&advanced=y&method=exact&num=100
//   견줌 표제어의 '-' · '^' · 띄어쓰기를 빼고 우리 낱말(띄어쓰기 뺀 것)과 글자가 똑같으면 found
//   캐시 data/pipeline/audit/g101-raw/dict/cache.jsonl (한 줄 = 한 낱말 · 끊겨도 이어서 · 다시 묻지 않는다)
//   요청 사이 0.3초 · 오류 020/021(키 문제 · 일시 정지)이면 바로 멈춘다
//
//   모듈   import { dictCheck } from './dict-check.mjs'  →  await dictCheck(['펄서', …]) → [{word, found, headword, origin, pos, def}]
//   명령   node scripts/dict-check.mjs 펄서 펄사                   (낱말 몇 개)
//          node scripts/dict-check.mjs --file words.txt [--out x.json]   (한 줄에 하나)
//          node scripts/dict-check.mjs --db [quizweb|quizweb_dev] [--out x.json]   (그 DB 활성 문항의 정답 — 한글이 든 것만)
// =============================================================================
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DIR = path.join(ROOT, 'data/pipeline/audit/g101-raw/dict');
const CACHE = path.join(DIR, 'cache.jsonl');
const GAP = 300;

export const squash = (s) => String(s ?? '').replace(/[-^\s]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let MEM = null;
function cache() {
  if (MEM) return MEM;
  MEM = new Map();
  if (existsSync(CACHE)) for (const l of readFileSync(CACHE, 'utf8').split('\n')) { if (!l.trim()) continue; try { const o = JSON.parse(l); MEM.set(o.word, o); } catch {} }
  return MEM;
}

export const stats = { calls: 0, cached: 0 };

async function ask(word) {
  const key = process.env.STDICT_API_KEY;
  if (!key) throw new Error('STDICT_API_KEY 가 .env 에 없다');
  const u = `https://stdict.korean.go.kr/api/search.do?key=${key}&q=${encodeURIComponent(word)}&req_type=json&advanced=y&method=exact&num=100`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      stats.calls++;
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = txt.trim() ? JSON.parse(txt) : {};
      if (j.error) { const e = new Error(`사전 API 오류 ${j.error.error_code} ${j.error.message}`); e.fatal = true; throw e; }
      return j.channel?.item ?? [];
    } catch (e) {
      if (e.fatal) throw e;
      if (t === 3) throw e;
      await sleep(2000 * (t + 1));
    }
  }
}

/** 낱말 하나 → {word, found, headword, origin, pos, def, n} (캐시 우선) */
export async function dictOne(word) {
  const C = cache();
  if (C.has(word)) { stats.cached++; return C.get(word); }
  const items = await ask(word);
  const me = squash(word);
  const hit = items.filter((i) => squash(i.word) === me);
  const h = hit[0];
  const o = { word, found: hit.length > 0, headword: h?.word ?? null, origin: h?.origin || null, pos: h?.pos ?? null, def: h?.sense?.definition ?? null, n: hit.length, at: new Date().toISOString() };
  mkdirSync(DIR, { recursive: true });
  appendFileSync(CACHE, JSON.stringify(o) + '\n');
  C.set(word, o);
  await sleep(GAP);
  return o;
}

/** 여러 낱말 — onProgress(i, n) 선택 */
export async function dictCheck(words, { onProgress } = {}) {
  const out = []; let i = 0;
  for (const w of words) { out.push(await dictOne(w)); i++; if (onProgress && i % 200 === 0) onProgress(i, words.length); }
  return out;
}

async function dbAnswers(db) {
  const { default: pg } = await import('pg');
  const url = new URL(process.env.DATABASE_URL); if (db) url.pathname = '/' + db;
  const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
  try { return (await c.query("select distinct display_answer a from questions where is_active and display_answer ~ '[가-힣]' order by 1")).rows.map((r) => r.a); }
  finally { await c.end(); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  let words;
  if (a.includes('--file')) words = readFileSync(opt('--file'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  else if (a.includes('--db')) { const d = opt('--db'); words = await dbAnswers(d && !d.startsWith('--') ? d : null); }
  else words = a.filter((x) => !x.startsWith('--'));
  const res = await dictCheck(words, { onProgress: (i, n) => console.error(`  ${i}/${n} · 호출 ${stats.calls}`) });
  const out = opt('--out');
  if (out) { writeFileSync(out, JSON.stringify({ n: res.length, found: res.filter((r) => r.found).length, items: res }, null, 1) + '\n'); console.log(`[dict-check] ${res.length} · 있음 ${res.filter((r) => r.found).length} · 호출 ${stats.calls} · 캐시 ${stats.cached} → ${out}`); }
  else for (const r of res) console.log(`${r.found ? 'O' : 'X'}  ${r.word}${r.found ? `  → ${r.headword}${r.origin ? ` (${r.origin})` : ''}` : ''}`);
}
