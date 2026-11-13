// ★ R074 (§F ①) — 백업 자동 정리
import { describe, expect, it } from 'vitest';
import { backupName, dbNameOf, freshBackup, freshHours, keepCount, pickPrune, stampMs } from './backup-prune.mjs';

const names = ['minigame-g018.zip', 'quizweb-20261030-232417.dump', 'quizweb-20261105-154326.dump', 'quizweb-20261031-192734.dump', 'quizweb-20261105-095802.dump', 'quizweb-20261101-000000.dump', 'quizweb-20261106-010000.dump', 'notes.txt', 'quizweb-x.dump'];
describe('R074 백업 정리', () => {
  it('최신 5개만 남기고 오래된 것부터 · zip · 다른 이름은 그대로', () => {
    expect(pickPrune(names, 5)).toEqual(['quizweb-20261030-232417.dump']);
    expect(pickPrune(names, 2)).toEqual(['quizweb-20261030-232417.dump', 'quizweb-20261031-192734.dump', 'quizweb-20261101-000000.dump', 'quizweb-20261105-095802.dump']);
    expect(pickPrune(names, 0)).toEqual([]);
    expect(pickPrune(names, 99)).toEqual([]);
  });
  it('남길 개수 — --keep > BACKUP_KEEP > 3(R100) · 이상한 값은 3', () => {
    expect(keepCount([], {})).toBe(3);
    expect(keepCount([], { BACKUP_KEEP: '8' })).toBe(8);
    expect(keepCount(['--keep', '3'], { BACKUP_KEEP: '8' })).toBe(3);
    expect(keepCount(['--keep', '0'], {})).toBe(0);
    expect(keepCount(['--keep', '-1'], {})).toBe(3);
    expect(keepCount([], { BACKUP_KEEP: 'abc' })).toBe(3);
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

describe('R100 A — 최근 백업이 있으면 건너뜀(같은 DB · 6시간)', () => {
  const now = new Date(2026, 10, 13, 20, 0, 0).getTime();
  const f = (name, size = 190e6) => ({ name, size });
  const entries = [f('quizweb-20261113-180000.dump'), f('quizweb-20261113-120000.dump'), f('quizweb_dev-20261113-195000.dump'), f('minigame-g018.zip')];
  it('같은 DB 의 가장 새 덤프가 6시간 안이면 그 이름 · 나이', () => {
    expect(freshBackup(entries, 'quizweb', 6, now)).toEqual({ name: 'quizweb-20261113-180000.dump', ageMs: 2 * 3_600_000 });
  });
  it('다른 DB 덤프는 치지 않는다 · 6시간 넘으면 null · 0 = 늘 뜸', () => {
    expect(freshBackup([f('quizweb_dev-20261113-195000.dump')], 'quizweb', 6, now)).toBeNull();
    expect(freshBackup([f('quizweb-20261113-130000.dump')], 'quizweb', 6, now)).toBeNull();
    expect(freshBackup(entries, 'quizweb', 0, now)).toBeNull();
  });
  it('0 바이트(실패한 덤프) · 미래 시각은 치지 않는다', () => {
    expect(freshBackup([f('quizweb-20261113-190000.dump', 0)], 'quizweb', 6, now)).toBeNull();
    expect(freshBackup([f('quizweb-20261114-190000.dump')], 'quizweb', 6, now)).toBeNull();
  });
  it('시간 — BACKUP_FRESH_HOURS > 6 · 0 허용 · 이상한 값은 6 · 이름의 시각', () => {
    expect(freshHours({})).toBe(6);
    expect(freshHours({ BACKUP_FRESH_HOURS: '0' })).toBe(0);
    expect(freshHours({ BACKUP_FRESH_HOURS: '1.5' })).toBe(1.5);
    expect(freshHours({ BACKUP_FRESH_HOURS: '-2' })).toBe(6);
    expect(stampMs('quizweb-20261113-180000.dump')).toBe(new Date(2026, 10, 13, 18, 0, 0).getTime());
    expect(stampMs('minigame.zip')).toBeNull();
  });
});
