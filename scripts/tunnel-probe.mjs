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
