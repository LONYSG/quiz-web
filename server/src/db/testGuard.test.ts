import { describe, expect, it } from 'vitest';
import { dbNameOf, testServerRefusal } from './testGuard.js';

describe('검사 서버 빗장 (R060 · D-253)', () => {
  const url = (db: string) => `postgresql://quiz:quizlocal@localhost:5434/${db}`;

  it('DB 이름 읽기', () => {
    expect(dbNameOf(url('quizweb'))).toBe('quizweb');
    expect(dbNameOf(url('quizweb_test') + '?sslmode=disable')).toBe('quizweb_test');
    expect(dbNameOf(undefined)).toBe('');
  });

  it('검사 서버 + 실 DB → 거부', () => {
    expect(testServerRefusal({ QUIZ_TEST_SERVER: '1', DATABASE_URL: url('quizweb') })).toMatch(/부팅 거부/);
    expect(testServerRefusal({ QUIZ_TEST_SERVER: '1', DATABASE_URL: 'not a url' })).toMatch(/부팅 거부/);
  });

  it('검사 서버 + 검사 DB → 통과 · 사람이 쓰는 서버(값 없음)는 실 DB 그대로', () => {
    expect(testServerRefusal({ QUIZ_TEST_SERVER: '1', DATABASE_URL: url('quizweb_test') })).toBeNull();
    expect(testServerRefusal({ DATABASE_URL: url('quizweb') })).toBeNull();
  });
});
