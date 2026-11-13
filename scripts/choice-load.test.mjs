// ★ R090 — choice-load 파일 꼴 검사(DB 없이)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readChoices } from './choice-load.mjs';

describe('choice-load readChoices', () => {
  it('파일 없음 = 0 · verified 만 · 꼴(qid 정수 · 보기 셋 이상 · 겹침 없음 · qid 한 번)', () => {
    expect(readChoices(path.join(os.tmpdir(), 'nope-choice.json'))).toMatchObject({ rows: [], missingFile: true });
    const dir = mkdtempSync(path.join(os.tmpdir(), 'choice-'));
    const f = path.join(dir, 'options.json');
    writeFileSync(
      f,
      JSON.stringify({
        game: 'choice',
        version: 1,
        items: [
          { qid: 1, options: ['가', '나', '다'], status: 'verified' },
          { qid: 2, options: ['가', '나', '다'], status: 'candidate' },
          { qid: 3, options: ['가', '나'], status: 'verified' },
          { qid: 4, options: ['가', '가', '다'], status: 'verified' },
          { qid: '5', options: ['가', '나', '다'], status: 'verified' },
          { qid: 1, options: ['라', '마', '바'], status: 'verified' },
        ],
      }),
    );
    const r = readChoices(f);
    rmSync(dir, { recursive: true, force: true }); // ★ R100 (D) — 임시 폴더를 남기지 않는다
    expect(r.rows.map((x) => x.qid)).toEqual([1]);
    expect(r.skip).toEqual({ shape: 4, status: 1 });
  });
});
