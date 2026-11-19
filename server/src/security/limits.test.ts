// ★ R107 — 한도 부품 · 진짜 IP · Origin
import { describe, expect, it } from 'vitest';
import { Gate, GateBusyError, Lockout, TokenBucket, WindowCounter, clientIpFrom, isLoopback } from './limits.js';
import { originAllowed } from './socket.js';
import { CSP } from './http.js';

describe('진짜 IP (CF-Connecting-IP 는 루프백에서 온 것만)', () => {
  it('터널(루프백) + 헤더 → 헤더 IP', () => {
    expect(clientIpFrom('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' })).toEqual({ ip: '203.0.113.7', local: false });
    expect(clientIpFrom('::ffff:127.0.0.1', { 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '2001:db8::1', local: false });
  });
  it('루프백 · 헤더 없음 → 이 PC 자신', () => {
    expect(clientIpFrom('::1', {})).toEqual({ ip: '::1', local: true });
    expect(clientIpFrom('127.0.0.1', {}).local).toBe(true);
  });
  it('★ 바깥(공유기 안 다른 기기)이 보낸 헤더는 버린다', () => {
    expect(clientIpFrom('192.168.0.23', { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' })).toEqual({ ip: '192.168.0.23', local: false });
    expect(clientIpFrom('::ffff:192.168.0.23', {})).toEqual({ ip: '192.168.0.23', local: false });
  });
  it('IP 꼴이 아닌 헤더는 버린다(루프백이어도)', () => {
    expect(clientIpFrom('127.0.0.1', { 'cf-connecting-ip': 'evil, 1.2.3.4' })).toEqual({ ip: '127.0.0.1', local: true });
  });
  it('isLoopback', () => {
    expect(isLoopback('127.0.0.5')).toBe(true);
    expect(isLoopback('10.0.0.1')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});

describe('WindowCounter', () => {
  it('창 안 max 개 · 창이 지나면 다시', () => {
    const w = new WindowCounter(1000, 2);
    expect(w.hit('a', 0)).toBe(true);
    expect(w.hit('a', 10)).toBe(true);
    expect(w.hit('a', 20)).toBe(false);
    expect(w.retryMs('a', 20)).toBe(980);
    expect(w.hit('b', 20)).toBe(true);
    expect(w.hit('a', 1001)).toBe(true);
  });
  it('열쇠가 끝없이 늘어도 표가 커지지 않는다', () => {
    const w = new WindowCounter(60_000, 1);
    for (let i = 0; i < 60_000; i += 1) w.add(`k${i}`, 0);
    expect(w.size).toBeLessThanOrEqual(50_000);
  });
});

describe('Lockout', () => {
  it('5번 틀리면 잠금 · 잠금 시간이 지나면 풀림 · 성공은 실패 수를 지운다', () => {
    const l = new Lockout(600_000, 5, 900_000);
    for (let i = 0; i < 4; i += 1) l.fail('id', i);
    expect(l.lockedFor('id', 10)).toBe(0);
    l.success('id');
    for (let i = 0; i < 4; i += 1) l.fail('id', 20 + i);
    expect(l.lockedFor('id', 30)).toBe(0);
    l.fail('id', 40);
    expect(l.lockedFor('id', 41)).toBe(900_000 - 1);
    expect(l.lockedFor('id', 40 + 900_000)).toBe(0);
  });
});

describe('TokenBucket', () => {
  it('burst 뒤 막힘 · 시간이 지나면 차오름', () => {
    const b = new TokenBucket(10, 3, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(100)).toBe(true);
    expect(b.take(100)).toBe(false);
  });
  it('초당 20(그림 조각 50ms) 은 30/90 통에 걸리지 않는다', () => {
    const b = new TokenBucket(30, 90, 0);
    let ok = true;
    for (let t = 0; t < 120_000; t += 50) ok = b.take(t) && ok;
    expect(ok).toBe(true);
  });
});

describe('Gate', () => {
  it('동시 2개 · 줄 1 · 넘치면 GateBusyError', async () => {
    const g = new Gate(2, 1);
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const a = g.run(() => hold);
    const b = g.run(() => hold);
    const c = g.run(async () => 'c');
    expect(g.stats).toEqual({ running: 2, waiting: 1 });
    await expect(g.run(async () => 'd')).rejects.toBeInstanceOf(GateBusyError);
    release();
    await Promise.all([a, b]);
    expect(await c).toBe('c');
    expect(g.stats).toEqual({ running: 0, waiting: 0 });
  });
});

describe('Origin 허용', () => {
  it('고정 주소 · localhost · 임시 주소 · Origin 없음', () => {
    expect(originAllowed('https://quizdojang.com', 'quizdojang.com')).toBe(true);
    expect(originAllowed('https://www.quizdojang.com', 'quizdojang.com')).toBe(true);
    expect(originAllowed('http://localhost:5173', null)).toBe(true);
    expect(originAllowed('https://abc-def-1.trycloudflare.com', null)).toBe(true);
    expect(originAllowed(undefined, null)).toBe(true);
  });
  it('남의 사이트 · 비슷한 이름은 거부', () => {
    expect(originAllowed('https://evil.example', 'quizdojang.com')).toBe(false);
    expect(originAllowed('https://quizdojang.com.evil.example', 'quizdojang.com')).toBe(false);
    expect(originAllowed('https://x.trycloudflare.com.evil.example', null)).toBe(false);
    expect(originAllowed('null', null)).toBe(false);
  });
});

describe('CSP', () => {
  it('끼워 넣기 금지 · 스크립트는 자기 것만', () => {
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toContain('unsafe-eval');
  });
});
