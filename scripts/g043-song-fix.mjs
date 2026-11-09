#!/usr/bin/env node
// =============================================================================
// G043 — V041 · V042 fixes 기계 적용(CV-168 · CV-170 · 18 §0 verified 전환 규칙) — 파일만 · DB 쓰기 없음
//   노래(song/items.json · audit/v041-song.json):
//     fix 14 → proposal 적용: trackId 교체는 iTunes lookup 결과(tmp/g043/lookup.json — 한 번 받은 것)로 itunes{} 갱신
//              (trackId · trackName · artistName · collectionName · previewUrl · artworkUrl100 · releaseDate · fetchedAt) · year
//              · minor 의 titleVariants 빼기 / 보탬 · artistVariants 보탬 → status verified · verify.appliedRound G043
//     verified 항목 → minor 의 "titleVariants 에서 빼기"만(status 그대로) · chart.rank · 다른 trackId 제안(0255 · 0159)은 안 함
//     rejected 1(0006) 그대로
//   OX(ox/items.json · audit/v042-ox.json): fix 16 → proposal 의 statement · explanation · answer · trap 적용 → verified · appliedRound
//   topics/us-state.json: us-state-006 variants 중복 "매사추세츠" 1개 빼기 · version +1 · fixes applied 표시 · verified 그대로
//   전후 diff → data/pipeline/audit/g043-diff.json
// 사용: node scripts/g043-song-fix.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => path.join(ROOT, p);
const APPLY = process.argv.includes('--apply');
const ROUND = 'G043';
const TODAY = '2026-11-09';
const rd = (p) => JSON.parse(readFileSync(P(p), 'utf8'));
const wr = (p, j) => writeFileSync(P(p), JSON.stringify(j, null, 1) + '\n');
const diff = { round: ROUND, song: [], songVariants: [], ox: [], topics: [] };

// ---------- 노래 ----------
const songFile = 'data/minigame/song/items.json';
const song = rd(songFile);
const v041 = rd('data/pipeline/audit/v041-song.json');
const lookup = new Map(rd('tmp/g043/lookup.json').results.map((r) => [r.trackId, r]));
const RM = 'titleVariants 에서 빼기(실제로 안 치는 영문 번역): ';
const ADD_T = 'titleVariants 에 보탬: ';
const ADD_A = 'artistVariants 에 보탬: ';
const pick = (minor, pre) => minor.filter((m) => m.startsWith(pre)).flatMap((m) => m.slice(pre.length).split(' / ').map((s) => s.trim()).filter(Boolean));

for (const it of song.items) {
  const v = v041[it.id];
  if (!v) throw new Error(`${it.id}: v041 결과 없음`);
  const minor = v.minor ?? [];
  const before = JSON.parse(JSON.stringify(it));
  const rmT = pick(minor, RM);
  if (v.verdict === 'fix') {
    if (it.status !== 'candidate') throw new Error(`${it.id}: fix 인데 status ${it.status}`);
    const pr = v.proposal ?? {};
    if (pr.trackId) {
      const r = lookup.get(pr.trackId);
      if (!r || !r.previewUrl) throw new Error(`${it.id}: lookup 없음 ${pr.trackId}`);
      Object.assign(it.itunes, {
        trackId: r.trackId, trackName: r.trackName, artistName: r.artistName, collectionName: r.collectionName,
        previewUrl: r.previewUrl, artworkUrl100: r.artworkUrl100, releaseDate: r.releaseDate, fetchedAt: TODAY,
      });
    }
    if (Number.isInteger(pr.year)) it.year = pr.year;
    it.titleVariants = it.titleVariants.filter((s) => !rmT.includes(s));
    for (const s of pick(minor, ADD_T)) if (!it.titleVariants.includes(s) && s !== it.title) it.titleVariants.push(s);
    for (const s of pick(minor, ADD_A)) if (!it.artistVariants.includes(s) && s !== it.artist) it.artistVariants.push(s);
    it.status = 'verified';
    it.verify.appliedRound = ROUND;
    diff.song.push({ id: it.id, category: v.category, before: { status: before.status, year: before.year, trackId: before.itunes.trackId, trackName: before.itunes.trackName, titleVariants: before.titleVariants, artistVariants: before.artistVariants }, after: { status: it.status, year: it.year, trackId: it.itunes.trackId, trackName: it.itunes.trackName, titleVariants: it.titleVariants, artistVariants: it.artistVariants } });
  } else if (it.status === 'verified' && rmT.length) {
    const tv = it.titleVariants.filter((s) => !rmT.includes(s));
    if (tv.length !== it.titleVariants.length) {
      diff.songVariants.push({ id: it.id, removed: it.titleVariants.filter((s) => rmT.includes(s)) });
      it.titleVariants = tv;
    }
  }
}
song.asOf = TODAY;
// version 은 파일 형식 번호(minigame-load 가 1 만 받음) — 올리지 않는다

// ---------- OX ----------
const oxFile = 'data/minigame/ox/items.json';
const ox = rd(oxFile);
const v042 = rd('data/pipeline/audit/v042-ox.json');
for (const it of ox.items) {
  const v = v042[it.id];
  if (!v) throw new Error(`${it.id}: v042 결과 없음`);
  if (v.verdict !== 'fix') continue;
  if (it.status !== 'candidate') throw new Error(`${it.id}: fix 인데 status ${it.status}`);
  const pr = v.proposal ?? {};
  const before = { statement: it.statement, explanation: it.explanation, answer: it.answer, trap: it.trap };
  for (const k of ['statement', 'explanation', 'answer', 'trap']) if (k in pr) it[k] = pr[k];
  // GEN 판단(되돌리기 쉽다): ox-0007 편수는 출처끼리 엇갈림(ko.wiki 30편 · 보도 31편) → V042 가 적은 "편수 없이" 쪽
  if (it.id === 'ox-0007') it.explanation = '1948년 정음사에서 펴낸 유고 시집이다.';
  // GEN 판단: ox-0380 은 함정 축이 시대 → 숫자로 바뀌어 factClaim 도 새 축에 맞춤(해설과 같은 사실)
  if (it.id === 'ox-0380') it.factClaim = '베이브 루스 1927년 한 시즌 홈런 60개';
  it.status = 'verified';
  it.verify.appliedRound = ROUND;
  diff.ox.push({ id: it.id, category: v.category, before, after: { statement: it.statement, explanation: it.explanation, answer: it.answer, trap: it.trap } });
}
ox.asOf = TODAY;
// version 그대로(파일 형식 1)

// ---------- topics/us-state ----------
const usFile = 'data/minigame/topics/us-state.json';
const us = rd(usFile);
const ma = us.items.find((i) => i.id === 'us-state-006');
const vb = [...ma.variants];
ma.variants = ma.variants.filter((s, i, a) => a.indexOf(s) === i);
if (ma.variants.length !== vb.length - 1) throw new Error('us-state-006: 중복 1개가 아님');
us.version += 1;
us.verify.fixes = us.verify.fixes.map((f) => (typeof f === 'string' ? { fix: f, applied: ROUND } : { ...f, applied: ROUND }));
us.verify.appliedRound = ROUND;
diff.topics.push({ topic: 'us-state', id: 'us-state-006', before: vb, after: ma.variants, version: us.version });

const summary = { song: diff.song.length, songVariantItems: diff.songVariants.length, songVariantsRemoved: diff.songVariants.reduce((n, d) => n + d.removed.length, 0), ox: diff.ox.length, topics: diff.topics.length };
const cnt = (items) => items.reduce((m, i) => ((m[i.status] = (m[i.status] ?? 0) + 1), m), {});
summary.songStatus = cnt(song.items);
summary.oxStatus = cnt(ox.items);
console.log(JSON.stringify(summary));
for (const d of diff.song) console.log(d.id, d.category, `${d.before.trackId}→${d.after.trackId}`, `${d.before.year}→${d.after.year}`, JSON.stringify(d.before.titleVariants), '→', JSON.stringify(d.after.titleVariants), JSON.stringify(d.after.artistVariants));
if (APPLY) {
  wr(songFile, song); wr(oxFile, ox); wr(usFile, us);
  wr('data/pipeline/audit/g043-diff.json', { ...diff, summary });
  console.log('적용 · audit/g043-diff.json');
} else console.log('dry-run (--apply 로 씀)');
