// R072 (D-316) — 터널 열림 확인 조각 단위 테스트
import { describe, expect, it } from 'vitest';
import { PROBE_MS, PROBE_EVERY_MS, REPORT_EVERY_MS, probeOnce, shouldOpen, shouldReport, waitOpen } from './tunnel-probe.mjs';

const T = 'https://a-b-c.trycloudflare.com/healthz';
const notFound = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
const ok = (status) => async () => ({ status });

describe('probeOnce — 응답 분류', () => {
  it('1.1.1.1 이 못 풀면 DNS 아직 · fetch 안 함', async () => {
    let fetched = 0;
    const r = await probeOnce(T, {
      resolve4: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); },
      fetchImpl: async () => { fetched++; return { status: 200 }; },
    });
    expect(r).toEqual({ ok: false, kind: 'dns', what: 'DNS 아직(ENOTFOUND)' });
    expect(fetched).toBe(0);
  });
  it('풀리고 200 이면 ok · 다른 상태는 상태 NNN', async () => {
    expect(await probeOnce(T, { resolve4: async () => ['1.2.3.4'], fetchImpl: ok(200) })).toMatchObject({ ok: true, kind: 'status', what: '상태 200' });
    expect(await probeOnce(T, { resolve4: async () => ['1.2.3.4'], fetchImpl: ok(530) })).toMatchObject({ ok: false, kind: 'status', what: '상태 530' });
  });
  it('연결 오류는 연결 안 됨(코드)', async () => {
    const r = await probeOnce(T, { resolve4: async () => [], fetchImpl: async () => { throw Object.assign(new TypeError('f'), { cause: { code: 'ECONNRESET' } }); } });
    expect(r).toEqual({ ok: false, kind: 'conn', what: '연결 안 됨(ECONNRESET)' });
  });
  it('1.1.1.1 은 풀리는데 OS ENOTFOUND → flushdns 한 번만 하고 다시', async () => {
    let flushes = 0; let calls = 0; const logs = [];
    const state = { flushed: false };
    const deps = {
      resolve4: async () => ['1.2.3.4'], state, log: (m) => logs.push(m),
      flush: async () => { flushes++; return true; },
      fetchImpl: async () => { calls++; if (calls < 3) throw notFound(); return { status: 200 }; },
    };
    expect(await probeOnce(T, deps)).toMatchObject({ ok: false, what: '연결 안 됨(ENOTFOUND)' }); // fetch 2번(전 · 후)
    expect(flushes).toBe(1);
    expect(logs).toHaveLength(1);
    expect(await probeOnce(T, deps)).toMatchObject({ ok: true }); // 두 번째엔 flush 안 함
    expect(flushes).toBe(1);
  });
});

describe('shouldReport — 10초마다 한 줄', () => {
  it('같은 응답이면 10초 칸이 바뀔 때만 · 응답이 바뀌면 바로', () => {
    const rep = {};
    const lines = [];
    for (let ms = 0; ms < 60_000; ms += 2_000) if (shouldReport(ms, 'DNS 아직', rep)) lines.push(ms);
    expect(lines).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000]);
    expect(shouldReport(52_000, '상태 530', rep)).toBe(true);
    expect(shouldReport(54_000, '상태 530', rep)).toBe(false);
  });
});

describe('waitOpen — 5분 상한 · 열리는 순간', () => {
  const clock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; };
  it('상수: 5분 · 2초 · 10초', () => {
    expect([PROBE_MS, PROBE_EVERY_MS, REPORT_EVERY_MS]).toEqual([300_000, 2_000, 10_000]);
  });
  it('90초 뒤 200 → ok · 줄은 10초마다(10줄)', async () => {
    const c = clock(); const reports = [];
    const r = await waitOpen(T, { ...c, probe: async () => (c.now() >= 90_000 ? { ok: true, what: '상태 200' } : { ok: false, what: 'DNS 아직' }), onReport: (el) => reports.push(el) });
    expect(r.ok).toBe(true);
    expect(r.ms).toBe(90_000);
    expect(reports).toHaveLength(9); // 0 · 10 · … · 80초 (90초에 열림)
  });
  it('끝까지 안 열리면 5분에서 멈추고 마지막 응답', async () => {
    const c = clock(); const reports = [];
    const r = await waitOpen(T, { ...c, probe: async () => ({ ok: false, what: 'DNS 아직' }), onReport: (el) => reports.push(el) });
    expect(r.ok).toBe(false);
    expect(r.ms).toBe(300_000);
    expect(r.tries).toBe(150);
    expect(reports).toHaveLength(30);
    expect(r.last.what).toBe('DNS 아직');
  });
});

describe('shouldOpen — 브라우저 열기 조건', () => {
  it('열림 확인 + NO_OPEN 아님일 때만', () => {
    expect(shouldOpen(true, {})).toBe(true);
    expect(shouldOpen(false, {})).toBe(false);
    expect(shouldOpen(true, { NO_OPEN: '1' })).toBe(false);
  });
});

// ★ R107 (D-364) — 고정 주소 / 임시 주소 갈래
import { readFileSync } from 'node:fs';
import { checkFriendHost, checkTunnelConfig, cleanHostname, tunnelPlan } from './tunnel-probe.mjs';
const B = String.fromCharCode(92); // 백슬래시(편집 도구가 망가뜨리지 않게)
const WIN_HOME = ['C:', 'Users', 'u'].join(B);
const WIN_CFG = [WIN_HOME, '.cloudflared', 'config.yml'].join(B);
const WIN_ALT = ['D:', 'cf', 'q.yml'].join(B);

describe('tunnelPlan — 고정 주소 갈래', () => {
  it('둘 다 없으면 임시 주소(지금 그대로)', () => {
    expect(tunnelPlan({}, 3000, WIN_HOME)).toEqual({ mode: 'quick', url: null, args: ['tunnel', '--url', 'http://localhost:3000', '--no-autoupdate'], why: null });
  });
  it('둘 다 있으면 이름 붙인 터널 · 설정은 사용자 폴더 .cloudflared', () => {
    const p = tunnelPlan({ TUNNEL_NAME: 'quizdojang', PUBLIC_HOSTNAME: 'https://QuizDojang.com/' }, 3000, WIN_HOME);
    expect(p).toEqual({
      mode: 'named', name: 'quizdojang', hostname: 'quizdojang.com', url: 'https://quizdojang.com',
      config: WIN_CFG,
      args: ['tunnel', '--no-autoupdate', '--config', WIN_CFG, 'run', 'quizdojang'],
    });
  });
  it('TUNNEL_CONFIG 로 설정 경로를 바꾼다', () => {
    expect(tunnelPlan({ TUNNEL_NAME: 'q', PUBLIC_HOSTNAME: 'quizdojang.com', TUNNEL_CONFIG: WIN_ALT }, 3000, '/h').config).toBe(WIN_ALT);
  });
  it('하나만 있거나 값이 이상하면 임시 주소 + 까닭', () => {
    expect(tunnelPlan({ PUBLIC_HOSTNAME: 'quizdojang.com' }, 3000).mode).toBe('quick');
    expect(tunnelPlan({ TUNNEL_NAME: 'q' }, 3000).why).toMatch(/PUBLIC_HOSTNAME/);
    expect(tunnelPlan({ TUNNEL_NAME: 'q', PUBLIC_HOSTNAME: 'not a host' }, 3000).mode).toBe('quick');
    expect(tunnelPlan({ TUNNEL_NAME: 'q & calc', PUBLIC_HOSTNAME: 'quizdojang.com' }, 3000).mode).toBe('quick');
  });
  it('cleanHostname', () => {
    expect(cleanHostname('quizdojang.com')).toBe('quizdojang.com');
    expect(cleanHostname('localhost')).toBe(null);
    expect(cleanHostname('a..b')).toBe(null);
  });
});

describe('checkTunnelConfig — 설정 파일 점검', () => {
  const good = [
    'tunnel: 11111111-2222-3333-4444-555555555555',
    `credentials-file: ${WIN_CFG.replace('config.yml', '11111111-2222-3333-4444-555555555555.json')}`,
    'ingress:',
    '  - hostname: quizdojang.com',
    '    service: http://localhost:3000',
    '  - service: http_status:404',
  ].join('\n');
  it('맞는 설정 → 고칠 것 없음', () => {
    expect(checkTunnelConfig(good, { hostname: 'quizdojang.com', port: 3000 })).toEqual([]);
  });
  it('포트 · 이름 · catch-all 이 틀리면 알린다', () => {
    expect(checkTunnelConfig(good, { hostname: 'quizdojang.com', port: 3001 })).toHaveLength(1);
    expect(checkTunnelConfig(good.replace('  - service: http_status:404', ''), { hostname: 'quizdojang.com', port: 3000 })).toHaveLength(1);
    expect(checkTunnelConfig(null, { hostname: 'quizdojang.com', port: 3000 })[0]).toMatch(/없습니다/);
  });
});

// ★★★ R109 (D-369) — 베타 주소 줄(경고만) · 저장소의 본보기가 두 점검을 다 통과하는가
describe('checkFriendHost — 베타 주소 줄', () => {
  const example = readFileSync(new URL('../ops/cloudflared.example.yml', import.meta.url), 'utf8');
  it('본보기 = 고정 · 베타 점검 둘 다 통과', () => {
    expect(checkTunnelConfig(example, { hostname: 'quizdojang.com', port: 3000 })).toEqual([]);
    expect(checkFriendHost(example, 'beta.quizdojang.com')).toEqual([]);
    // ★ R120 — www 줄도 beta 와 같은 꼴(hostname + httpHostHeader)
    expect(checkFriendHost(example, 'www.quizdojang.com')).toEqual([]);
  });
  it('베타 줄 없음 · Host 고정 없음 → 경고 둘 · FRIEND_HOSTNAME 없으면 아무것도', () => {
    const noBeta = 'ingress:\n  - hostname: quizdojang.com\n    service: http://localhost:3000\n  - service: http_status:404\n';
    expect(checkFriendHost(noBeta, 'beta.quizdojang.com')).toHaveLength(2);
    expect(checkFriendHost(noBeta, undefined)).toEqual([]);
  });
});
