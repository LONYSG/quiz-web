// ★ R074 (§F ①) — 백업 자동 정리
import { describe, expect, it } from 'vitest';
import { backupName, dbNameOf, keepCount, pickPrune } from './backup-prune.mjs';

const names = ['minigame-g018.zip', 'quizweb-20261030-232417.dump', 'quizweb-20261105-154326.dump', 'quizweb-20261031-192734.dump', 'quizweb-20261105-095802.dump', 'quizweb-20261101-000000.dump', 'quizweb-20261106-010000.dump', 'notes.txt', 'quizweb-x.dump'];
describe('R074 백업 정리', () => {
  it('최신 5개만 남기고 오래된 것부터 · zip · 다른 이름은 그대로', () => {
    expect(pickPrune(names, 5)).toEqual(['quizweb-20261030-232417.dump']);
    expect(pickPrune(names, 2)).toEqual(['quizweb-20261030-232417.dump', 'quizweb-20261031-192734.dump', 'quizweb-20261101-000000.dump', 'quizweb-20261105-095802.dump']);
    expect(pickPrune(names, 0)).toEqual([]);
    expect(pickPrune(names, 99)).toEqual([]);
  });
  it('남길 개수 — --keep > BACKUP_KEEP > 5 · 이상한 값은 5', () => {
    expect(keepCount([], {})).toBe(5);
    expect(keepCount([], { BACKUP_KEEP: '8' })).toBe(8);
    expect(keepCount(['--keep', '3'], { BACKUP_KEEP: '8' })).toBe(3);
    expect(keepCount(['--keep', '0'], {})).toBe(0);
    expect(keepCount(['--keep', '-1'], {})).toBe(5);
    expect(keepCount([], { BACKUP_KEEP: 'abc' })).toBe(5);
  });
});

describe('R095 백업 이름 = DB 이름 · 정리는 같은 DB 끼리(D-352 · G060 사고)', () => {
  it('dev 백업이 많아도 실 백업은 지우지 않는다', () => {
    const mix = ['quizweb-20261110-221145.dump', 'quizweb-20261110-235818.dump', 'quizweb_dev-20261111-010000.dump', 'quizweb_dev-20261111-020000.dump', 'quizweb_dev-20261111-030000.dump', 'quizweb_dev-g060-20261110-235831.dump'];
    expect(pickPrune(mix, 2)).toEqual(['quizweb_dev-20261111-010000.dump']);
    expect(pickPrune(mix, 1)).toEqual(['quizweb-20261110-221145.dump', 'quizweb_dev-20261111-010000.dump', 'quizweb_dev-20261111-020000.dump']);
  });
  it('이름 · DB 고르기', () => {
    expect(backupName('quizweb_dev', '20261111-010203')).toBe('quizweb_dev-20261111-010203.dump');
    expect(backupName('../x', '20261111-010203')).toBe('quizweb-20261111-010203.dump');
    expect(dbNameOf({ DB_NAME: 'quizweb_dev', DATABASE_URL: 'postgresql://u:p@localhost:5434/quizweb' })).toBe('quizweb_dev');
    expect(dbNameOf({ DATABASE_URL: 'postgresql://u:p@localhost:5434/quizweb_dev' })).toBe('quizweb_dev');
    expect(dbNameOf({})).toBe('quizweb');
  });
});
