#!/usr/bin/env node
// =============================================================================
// G049 — 노래 표기 변형 보강(18 §10 "표기 변형 보강" · 찬종 "띄어쓰기 · 한국어 · 원어 다 허용") — 파일만 · DB 쓰기 없음
//   ① --fetch: 곡마다 itunes.trackId 로 lookup country=KR · JP(키 없음 · 초당 ≤ 3 · 실패는 건너뛰고 목록) → audit/g049-song-lookup.json
//   ② 적용: KR · JP trackName → titleVariants · artistName → artistVariants
//        떼는 것: 괄호 · 대괄호 덧붙임((feat. …) · (From "…") · [Remastered] …) · " - Single" 꼴
//        건너뜀: 정본과 정규화로 같음 · 이미 있음 · 특수문자(song-check SPECIAL) · 제목이 다른 곡 title/titleVariants 와 겹침
//   ③ V041(G043)이 뺀 영문 원제 64 복원(g043-diff.json songVariants · 같은 건너뜀 규칙)
//   ④ GEN 직접(HAND): J-pop · 팝의 한국어 통용 제목 · 한글 음차 1 · 가수 한글 표기 — 통용 제목이 없으면 안 씀
//   previewUrl · year · status · itunes 는 안 건드림 · 곡마다 변형 수 전후 → audit/g049-song-diff.json
// 사용: node scripts/g049-song-variants.mjs --fetch | [--apply]
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';
import { HAND } from './g049-song-hand.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/minigame/song/items.json');
const LOOK = path.join(ROOT, 'data/pipeline/audit/g049-song-lookup.json');
const C = (s) => flexCanon(String(s ?? ''));
const SPECIAL = /[^\p{L}\p{N} .·'\-&:!?,/~]/u; // song-check 와 같음
const doc = JSON.parse(readFileSync(FILE, 'utf8'));
const items = doc.items;

if (process.argv.includes('--fetch')) {
  const out = existsSync(LOOK) ? JSON.parse(readFileSync(LOOK, 'utf8')) : { fetchedAt: new Date().toISOString().slice(0, 10), items: {} };
  let n = 0;
  for (const it of items) {
    const id = it.itunes?.trackId; if (!id) continue;
    for (const c of ['KR', 'JP']) {
      const key = `${it.id}:${c}`;
      if (out.items[key]?.ok) continue;
      try {
        const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${c}`);
        const j = await r.json();
        const x = j.results?.[0];
        out.items[key] = x ? { ok: true, trackName: x.trackName, artistName: x.artistName, collectionName: x.collectionName } : { ok: false, why: `resultCount ${j.resultCount}` };
      } catch (e) { out.items[key] = { ok: false, why: String(e.message ?? e) }; }
      n++;
      await new Promise((res) => setTimeout(res, 380));
    }
  }
  writeFileSync(LOOK, JSON.stringify(out, null, 1) + '\n');
  const fail = Object.entries(out.items).filter(([, v]) => !v.ok);
  console.log(`lookup ${n} · 실패 ${fail.length}`, fail.map(([k, v]) => `${k} ${v.why}`).join(' | '));
  process.exit(0);
}

const APPLY = process.argv.includes('--apply');
const look = JSON.parse(readFileSync(LOOK, 'utf8'));
const g043 = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g043-diff.json'), 'utf8'));
const clean = (s) => String(s ?? '').replace(/・/g, '·').replace(/[‘’]/g, "'").replace(/\s*[([（【][^)\]）】]*[)\]）】]/g, '').replace(/\s+-\s+(Single|EP)$/i, '').replace(/\s+/g, ' ').trim();

// 제목 정규화 → 곡 id (다른 곡과 겹침 검사)
const titleOwner = new Map();
for (const it of items) for (const v of [it.title, ...it.titleVariants]) if (!titleOwner.has(C(v))) titleOwner.set(C(v), it.id);

const res = { round: 'G049', fetchedAt: look.fetchedAt, items: [], skipped: [], totals: { title: 0, artist: 0, restored: 0, hand: 0, skipped: 0 } };
function add(it, field, raw, src) {
  const v = clean(raw);
  if (!v) return false;
  const own = field === 'title' ? [it.title, ...it.titleVariants] : [it.artist, ...it.artistVariants];
  const c = C(v);
  const skip = (why) => { res.skipped.push({ id: it.id, field, text: v, src, why }); res.totals.skipped++; return false; };
  if (!c) return skip('정규화가 빔');
  if (own.some((x) => C(x) === c)) return false; // 이미 있음(조용히)
  if (SPECIAL.test(v)) return skip('특수문자');
  if (field === 'title') { const o = titleOwner.get(c); if (o && o !== it.id) return skip(`${o} 제목과 겹침`); titleOwner.set(c, it.id); it.titleVariants.push(v); }
  else it.artistVariants.push(v);
  return true;
}
const restoreMap = new Map(g043.songVariants.map((x) => [x.id, x.removed]));
for (const it of items) {
  const before = { t: it.titleVariants.length, a: it.artistVariants.length };
  const row = { id: it.id, pool: it.pool, title: it.title, artist: it.artist, added: [] };
  for (const s of restoreMap.get(it.id) ?? []) if (add(it, 'title', s, 'G043 복원')) { res.totals.restored++; row.added.push(`복원 ${s}`); }
  for (const c of ['KR', 'JP']) {
    const x = look.items[`${it.id}:${c}`]; if (!x?.ok) continue;
    if (add(it, 'title', x.trackName, c)) { res.totals.title++; row.added.push(`${c} ${clean(x.trackName)}`); }
    if (add(it, 'artist', x.artistName, c)) { res.totals.artist++; row.added.push(`${c} 가수 ${clean(x.artistName)}`); }
  }
  for (const h of HAND[it.id] ?? []) {
    const [field, s] = h.startsWith('@') ? ['artist', h.slice(1)] : ['title', h];
    if (add(it, field, s, 'GEN')) { res.totals.hand++; row.added.push(`GEN ${field === 'artist' ? '가수 ' : ''}${s}`); }
  }
  row.before = before; row.after = { t: it.titleVariants.length, a: it.artistVariants.length };
  if (row.added.length) res.items.push(row);
}
for (const id of Object.keys(HAND)) if (!items.some((x) => x.id === id)) throw new Error(`HAND 에 없는 곡 ${id}`);
const lookFail = Object.entries(look.items).filter(([, v]) => !v.ok).map(([k, v]) => `${k} ${v.why}`);
res.lookupFail = lookFail;
res.handSongs = Object.keys(HAND).length;
console.log(JSON.stringify(res.totals), '· 바뀐 곡', res.items.length, '· lookup 실패', lookFail.length);
for (const s of res.skipped) console.log('  건너뜀', s.id, s.field, s.text, '—', s.src, s.why);
if (APPLY) {
  writeFileSync(FILE, JSON.stringify(doc, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g049-song-diff.json'), JSON.stringify(res, null, 1) + '\n');
  console.log('적용 · audit/g049-song-diff.json');
} else console.log('dry-run (--apply 로 씀)');
