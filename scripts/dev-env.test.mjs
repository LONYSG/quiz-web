import { describe, expect, it } from 'vitest';
import { devOverrides, withDbName } from './dev-env.mjs';

describe('개발 서버 env (R078 · D-333)', () => {
  const live = 'postgresql://u:p@localhost:5434/quizweb';
  it('기본 = 3001 · .env 접속 정보 그대로 DB 이름만 quizweb_dev · 셸 PORT 무시', () => {
    const o = devOverrides({ env: { PORT: '3000', DATABASE_URL: live }, dotEnv: { DATABASE_URL: live, PORT: '3000' }, envDev: {} });
    expect(o.PORT).toBe('3001');
    expect(o.DATABASE_URL).toBe('postgresql://u:p@localhost:5434/quizweb_dev');
    expect(o.QUIZ_DEV_SERVER).toBe('1');
    expect(o.fromEnvDev).toBe(false);
  });
  it('.env.dev < DEV_PORT · DEV_DATABASE_URL', () => {
    const envDev = { PORT: '3005', DATABASE_URL: withDbName(live, 'mine') };
    expect(devOverrides({ env: {}, dotEnv: {}, envDev }).PORT).toBe('3005');
    expect(devOverrides({ env: {}, dotEnv: {}, envDev }).DATABASE_URL).toMatch(/\/mine$/);
    expect(devOverrides({ env: { DEV_PORT: '3009' }, dotEnv: {}, envDev }).PORT).toBe('3009');
  });
});
