// =============================================================================
// 터널 열림 확인 조각 — dev-tunnel.mjs 가 쓴다 (R072 · D-316)
//
// dev-tunnel.mjs 는 import 하자마자 cloudflared 를 띄우므로, 테스트할 수 있는 순수 로직은 여기 둔다.
//   ① DNS 는 1.1.1.1 · 1.0.0.1 에 직접 묻는다(Windows OS 캐시가 ENOTFOUND 를 몇 분 들고 있어도 Cloudflare 쪽이 퍼졌는지 본다)
//   ② 풀리면 fetch(OS 리졸버) — 그런데도 ENOTFOUND 면 ipconfig /flushdns 를 한 번 하고 다시
//   ③ 응답 종류: DNS 아직 · 연결 안 됨(코드) · 상태 NNN
// =============================================================================

import { Resolver } from 'node:dns/promises';
import { exec } from 'node:child_process';

export const REGISTER_WAIT_MS = 30_000; // 'Registered tunnel connection' 줄 기다림 (R070 그대로)
export const PROBE_MS = 300_000; // ★ R072: 45초 → 5분 — 열릴 때까지 뒤에서 계속 확인
export const PROBE_EVERY_MS = 2_000; // 2초 간격 그대로
export const REPORT_EVERY_MS = 10_000; // ★ R072: "등록 대기" 줄은 10초마다 한 줄

/** 1.1.1.1 에 직접 묻는 resolve4 */
export function cloudflareResolve4() {
  const r = new Resolver({ timeout: 3000, tries: 1 });
  r.setServers(['1.1.1.1', '1.0.0.1']);
  return (host) => r.resolve4(host);
}

/** Windows DNS 캐시 비우기 — 실패는 무시 */
export function flushDns() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    exec('ipconfig /flushdns', { timeout: 5000, windowsHide: true }, (err) => resolve(!err));
  });
}

async function fetchStatus(fetchImpl, target, ms) {
  try {
    const res = await fetchImpl(target, { signal: AbortSignal.timeout(ms), redirect: 'manual' });
    return { status: res.status };
  } catch (e) {
    return { code: e?.cause?.code ?? e?.code ?? e?.name ?? 'error' };
  }
}

const fromFetch = (r) =>
  r.status != null
    ? { ok: r.status === 200, kind: 'status', what: `상태 ${r.status}` }
    : { ok: false, kind: 'conn', what: `연결 안 됨(${r.code})` };

/**
 * 밖에서 <target> 을 한 번 친다.
 * deps: resolve4(host) · fetchImpl · flush() · state({ flushed }) · log(msg)
 * 돌려줌: { ok, kind: 'dns'|'conn'|'status', what }
 */
export async function probeOnce(target, deps, ms = 5000) {
  const { resolve4, fetchImpl = fetch, flush = flushDns, state = {}, log = () => {} } = deps;
  if (resolve4) {
    try {
      await resolve4(new URL(target).hostname);
    } catch (e) {
      return { ok: false, kind: 'dns', what: `DNS 아직(${e?.code ?? 'error'})` };
    }
  }
  let r = await fetchStatus(fetchImpl, target, ms);
  if (r.code === 'ENOTFOUND' && resolve4 && !state.flushed) {
    // 1.1.1.1 은 풀리는데 OS 는 못 푼다 = OS 음수 캐시 → 한 번만 비우고 다시
    state.flushed = true;
    const done = await flush();
    log(`1.1.1.1 은 풀리는데 OS 는 ENOTFOUND — ipconfig /flushdns ${done ? '함' : '실패(무시)'} · 다시 칩니다`);
    r = await fetchStatus(fetchImpl, target, ms);
  }
  return fromFetch(r);
}

/**
 * 이번 응답을 줄로 찍을지 — 10초 칸이 바뀌었거나 응답 종류(what)가 바뀌었을 때만.
 * rep: { bucket, what } (호출 쪽이 들고 있다) → 찍으면 rep 를 고친다.
 */
export function shouldReport(elapsedMs, what, rep, every = REPORT_EVERY_MS) {
  const bucket = Math.floor(elapsedMs / every);
  if (rep.bucket === undefined || bucket > rep.bucket || what !== rep.what) {
    rep.bucket = bucket;
    rep.what = what;
    return true;
  }
  return false;
}

/** 브라우저를 열지 — 밖에서 200 을 확인했고 NO_OPEN 이 아닐 때만 (R070 · R072 그대로) */
export const shouldOpen = (opened, env = process.env) => Boolean(opened) && !env.NO_OPEN;

/**
 * 열릴 때까지 확인 — 200 이면 { ok:true, ms } · limit 이 지나면 { ok:false, last }.
 * deps: probe(target) · now() · sleep(ms) · onReport(elapsedMs, res)
 */
export async function waitOpen(target, deps, { limit = PROBE_MS, every = PROBE_EVERY_MS } = {}) {
  const { probe, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onReport = () => {} } = deps;
  const p0 = now();
  const rep = {};
  let last = { ok: false, kind: '-', what: '-' };
  let tries = 0;
  while (now() - p0 < limit) {
    last = await probe(target);
    tries++;
    if (last.ok) return { ok: true, ms: now() - p0, tries, last };
    const el = now() - p0;
    if (shouldReport(el, last.what, rep)) onReport(el, last);
    await sleep(every);
  }
  return { ok: false, ms: now() - p0, tries, last };
}

// =============================================================================
// ★★ R107 (D-364) — 고정 주소(이름 붙인 터널) / 임시 주소 갈래
//   .env 에 TUNNEL_NAME · PUBLIC_HOSTNAME 이 **둘 다** 있으면 이름 붙인 터널:
//     cloudflared tunnel --no-autoupdate --config <설정> run <이름>   (주소 = https://<PUBLIC_HOSTNAME> · 바뀌지 않는다)
//     설정 파일 = TUNNEL_CONFIG 또는 %USERPROFILE%\.cloudflared\config.yml (저장소 밖 — 본보기 ops/cloudflared.example.yml)
//     ★ Cloudflare 문서: run 에는 --url 이 없다 — 서버 주소는 설정 파일의 ingress(service: http://localhost:<포트>)로 정한다
//   하나라도 없으면 지금처럼 임시 주소: cloudflared tunnel --url http://localhost:<포트> --no-autoupdate
// =============================================================================

/** 호스트 이름 꼴(https:// · 끝 / 를 떼고 소문자) — 이상하면 null */
export function cleanHostname(v) {
  const h = String(v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h) ? h : null;
}

/**
 * @returns {{ mode: 'named', name: string, hostname: string, url: string, config: string, args: string[] }
 *         | { mode: 'quick', url: null, args: string[], why: string | null }}
 */
export function tunnelPlan(env, port, home = env.USERPROFILE || env.HOME || '') {
  const name = String(env.TUNNEL_NAME ?? '').trim();
  const host = cleanHostname(env.PUBLIC_HOSTNAME);
  const target = `http://localhost:${port}`;
  const quick = (why) => ({ mode: 'quick', url: null, args: ['tunnel', '--url', target, '--no-autoupdate'], why });
  if (!name && !env.PUBLIC_HOSTNAME) return quick(null);
  if (!name) return quick('PUBLIC_HOSTNAME 만 있고 TUNNEL_NAME 이 없다 — 임시 주소로');
  if (!host) return quick(`PUBLIC_HOSTNAME 이 ${env.PUBLIC_HOSTNAME ? '도메인 꼴이 아니다' : '없다'} — 임시 주소로`);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return quick('TUNNEL_NAME 에 쓸 수 없는 글자 — 임시 주소로');
  const sep = home.includes('\\') ? '\\' : '/';
  const config = String(env.TUNNEL_CONFIG ?? '').trim() || `${home}${sep}.cloudflared${sep}config.yml`;
  return { mode: 'named', name, hostname: host, url: `https://${host}`, config, args: ['tunnel', '--no-autoupdate', '--config', config, 'run', name] };
}

/**
 * 설정 파일 글을 읽어 맞는지 본다(고칠 것 목록 — 비면 됨). 파일 내용은 찍지 않는다(터널 ID 가 들어 있다).
 *   ingress 에 그 호스트 이름 · service http://localhost:<포트> · 끝의 catch-all(http_status:404)
 */
/**
 * ★★★ R109 (D-369) — 베타 주소(FRIEND_HOSTNAME) 줄 점검. **막지 않는다**(고정 주소는 그대로 연다 — 베타 주소로만 못 들어올 뿐) · 경고 줄만
 */
export function checkFriendHost(text, friendHostname) {
  const h = cleanHostname(friendHostname);
  if (!h || text == null) return [];
  const out = [];
  const esc = h.replace(/\./g, '\\.');
  if (!new RegExp(`hostname\\s*:\\s*["']?${esc}["']?\\s*$`, 'm').test(text)) out.push(`ingress 에 hostname: ${h} (베타 주소) 이 없다 — 베타 주소로는 들어올 수 없다(docs/11 4-4)`);
  if (!new RegExp(`httpHostHeader\\s*:\\s*["']?${esc}["']?\\s*$`, 'm').test(text)) out.push(`베타 주소 줄에 originRequest.httpHostHeader: ${h} 가 없다 — 서버가 자리를 못 가를 수 있다(본보기 ops/cloudflared.example.yml)`);
  return out;
}

export function checkTunnelConfig(text, { hostname, port }) {
  if (text == null) return ['설정 파일이 없습니다 — docs/11 "도메인 연결 — 한 번만" 4단계'];
  const problems = [];
  if (!/^\s*tunnel\s*:/m.test(text)) problems.push('tunnel: 줄이 없다');
  if (!/^\s*credentials-file\s*:/m.test(text)) problems.push('credentials-file: 줄이 없다');
  if (!new RegExp(`hostname\\s*:\\s*["']?${hostname.replace(/\./g, '\\.')}["']?\\s*$`, 'm').test(text)) problems.push(`ingress 에 hostname: ${hostname} 이 없다`);
  if (!new RegExp(`service\\s*:\\s*["']?http://(localhost|127\\.0\\.0\\.1):${port}["']?\\s*$`, 'm').test(text)) problems.push(`ingress 에 service: http://localhost:${port} 가 없다`);
  if (!/service\s*:\s*http_status:404/.test(text)) problems.push('끝에 - service: http_status:404 (catch-all) 가 없다');
  return problems;
}
