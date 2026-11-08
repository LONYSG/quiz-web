// R084 — 노래 적재(순수 부분): 칸 검사 · 넣을 status · 실제 파일 293 통과 · minigame-load 빗장(실 quizweb + candidate = exit 2)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadableStatus, songProblems } from './minigame-song.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const good = () => ({
  id: 'song-0001',
  status: 'verified',
  createdRound: 'G040',
  title: '좋은 날',
  titleVariants: ['Good Day'],
  artist: '아이유',
  artistVariants: ['IU'],
  year: 2010,
  itunes: { trackId: 1, country: 'US', trackName: 'Good Day', artistName: 'IU', collectionName: 'Real', previewUrl: 'https://audio-ssl.itunes.apple.com/x.m4a', previewSec: 30, artworkUrl100: 'https://is1-ssl.mzstatic.com/x.jpg', releaseDate: '2010-12-09T12:00:00Z', fetchedAt: '2026-11-08' },
  pool: 'kpop-year',
  chart: { source: '멜론 연간', year: 2011, rank: 1 },
  qid: 2970,
  sources: [],
  tags: [],
  verify: null,
});

describe('minigame-song', () => {
  it('좋은 항목은 통과 · qid 숫자/글/null', () => {
    expect(songProblems(good())).toEqual([]);
    expect(songProblems({ ...good(), qid: 'q-1' })).toEqual([]);
    expect(songProblems({ ...good(), qid: null, chart: null })).toEqual([]);
  });
  it('previewUrl 없음 · http · year · pool · 변형 배열을 막는다', () => {
    const a = good();
    a.itunes = { ...a.itunes, previewUrl: '' };
    expect(songProblems(a)).toContain('itunes.previewUrl 없음');
    const b = good();
    b.itunes = { ...b.itunes, previewUrl: 'http://x' };
    expect(songProblems(b)).toContain('itunes.previewUrl https');
    expect(songProblems({ ...good(), year: 2010.5 })).toContain('year');
    expect(songProblems({ ...good(), pool: 'rock' })).toContain('pool rock');
    expect(songProblems({ ...good(), titleVariants: 'Good Day' })).toContain('titleVariants 배열');
  });
  it('넣을 status — verified · loaded · candidate 는 허용할 때만', () => {
    expect(loadableStatus('verified', false)).toBe(true);
    expect(loadableStatus('loaded', false)).toBe(true);
    expect(loadableStatus('candidate', false)).toBe(false);
    expect(loadableStatus('candidate', true)).toBe(true);
    expect(loadableStatus('rejected', true)).toBe(false);
  });
  it('실제 파일(G040) — 전부 형식 통과', () => {
    const doc = JSON.parse(readFileSync(path.join(ROOT, 'data/minigame/song/items.json'), 'utf8'));
    expect(doc.game).toBe('song');
    const bad = doc.items.map((it) => [it.id, songProblems(it)]).filter(([, p]) => p.length);
    expect(bad).toEqual([]);
  });
  it('minigame-load — 실 quizweb 에 --allow-candidate 는 연결 전 exit 2', () => {
    const r = spawnSync(process.execPath, ['scripts/minigame-load.mjs', '--game', 'song', '--allow-candidate', '--apply'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: 'postgresql://quiz:x@127.0.0.1:1/quizweb', QUIZ_DEV_SERVER: '' },
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('candidate');
  });
});
