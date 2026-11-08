// R085 — OX 적재(순수 부분): 칸 검사 · 실제 파일 400 통과 · minigame-load dry-run 에 ox 줄
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { oxProblems } from './minigame-ox.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const good = () => ({
  id: 'ox-0001',
  status: 'verified',
  createdRound: 'G041',
  statement: '왕건은 918년에 고려를 세웠고, 이듬해 송악으로 도읍을 옮겼다.',
  answer: true,
  explanation: '918년 즉위 · 919년 송악 천도.',
  category: { l1: '한국', l2: '한국사' },
  grade: 1,
  trap: 'none',
  pairId: null,
  factClaim: '고려 건국 918',
  sources: [],
  tags: [],
  verify: null,
});

describe('minigame-ox', () => {
  it('좋은 항목 통과 · 거짓 + 한 축 · 쌍 id', () => {
    expect(oxProblems(good())).toEqual([]);
    expect(oxProblems({ ...good(), answer: false, trap: 'number', pairId: 'p-01' })).toEqual([]);
  });
  it('answer 글 · grade 4 · trap 모름 · 참인데 함정 · 거짓인데 none · 짧은 문장 · 빈 해설', () => {
    expect(oxProblems({ ...good(), answer: 'true' })).toContain('answer true/false');
    expect(oxProblems({ ...good(), grade: 4 })).toContain('grade 1~3');
    expect(oxProblems({ ...good(), trap: 'color' })).toContain('trap color');
    expect(oxProblems({ ...good(), trap: 'name' })).toContain('trap ↔ answer(참 = none · 거짓 = 한 축)');
    expect(oxProblems({ ...good(), answer: false })).toContain('trap ↔ answer(참 = none · 거짓 = 한 축)');
    expect(oxProblems({ ...good(), statement: '짧다.' })).toContain('statement 10~120자');
    expect(oxProblems({ ...good(), explanation: ' ' })).toContain('explanation');
  });
  it('실제 파일(G041) — 전부 형식 통과', () => {
    const doc = JSON.parse(readFileSync(path.join(ROOT, 'data/minigame/ox/items.json'), 'utf8'));
    expect(doc.game).toBe('ox');
    expect(doc.items.map((it) => [it.id, oxProblems(it)]).filter(([, p]) => p.length)).toEqual([]);
  });
  it('minigame-load dry-run — ox 줄 · 형식 거부 0', () => {
    const r = spawnSync(process.execPath, ['scripts/minigame-load.mjs', '--game', 'ox'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    const line = r.stdout.split('\n').find((l) => l.startsWith('ox '));
    expect(line).toBeTruthy();
    expect(r.stdout).not.toContain('형식 거부');
  });
});
