// =============================================================================
// ★★ R107 (D-365) — 공개 대비 한도의 부품 (메모리 · 순수 — DB 를 건드리지 않는다)
//
//   clientIpFrom   진짜 IP — 루프백에서 온 요청만 CF-Connecting-IP 를 믿는다
//   WindowCounter  창 안의 횟수(로그인 실패 · 가입 · 방 만들기)
//   Lockout        n번 실패 → 잠금(아이디)
//   TokenBucket    초당 n · 한꺼번에 burst(소켓 이벤트)
//   Gate           동시 실행 한도 + 대기 줄(argon2)
//   Counter        지금 열린 수(소켓 — IP · 계정)
//
// ★ 공격자가 열쇠(IP · 아이디)를 끝없이 바꿔도 메모리가 무한히 늘지 않게, 표가 커지면 지난 것을 지우고
//   그래도 크면 오래된 것부터 버린다(MAX_KEYS).
// =============================================================================

import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';

const MAX_KEYS = 50_000;

/** 루프백 주소인가(IPv4 · IPv6 · IPv4-mapped) */
export function isLoopback(addr: string | undefined | null): boolean {
  if (!addr) return false;
  return addr === '::1' || addr.startsWith('127.') || addr.startsWith('::ffff:127.');
}

function normalizeIp(addr: string): string {
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr;
}

export interface ClientIp {
  /** 한도에 쓰는 IP */
  ip: string;
  /** 이 PC 자신 — 루프백인데 CF-Connecting-IP 가 없다(봇 · ui-check · localhost) */
  local: boolean;
}

/**
 * ★★ 진짜 IP.
 *   · 요청이 루프백에서 왔을 때만 CF-Connecting-IP 를 믿는다 — 터널(cloudflared)은 이 PC 안에서 서버로 붙는다.
 *     Cloudflare 는 바깥 사람이 보낸 CF-Connecting-IP 를 자기 값으로 덮어쓴다.
 *   · 루프백이 아닌 곳에서 온 헤더는 버린다(같은 공유기의 다른 기기가 헤더로 남인 척하는 것 — HOST=0.0.0.0 일 때만 가능).
 *   · X-Forwarded-For 는 보지 않는다(cloudflared 앞에 다른 프록시가 없다).
 */
export function clientIpFrom(remote: string | undefined | null, headers: IncomingHttpHeaders): ClientIp {
  const raw = remote ?? '';
  if (isLoopback(raw)) {
    const h = headers['cf-connecting-ip'];
    const v = (Array.isArray(h) ? h[0] : h)?.trim();
    if (v && isIP(v)) return { ip: normalizeIp(v), local: false };
    return { ip: normalizeIp(raw) || '127.0.0.1', local: true };
  }
  return { ip: normalizeIp(raw) || 'unknown', local: false };
}

function trim<V>(map: Map<string, V>, alive: (v: V) => boolean): void {
  if (map.size < MAX_KEYS) return;
  for (const [k, v] of map) if (!alive(v)) map.delete(k);
  // 그래도 크면 오래된(먼저 넣은) 것부터 버린다
  if (map.size >= MAX_KEYS) {
    let drop = map.size - Math.floor(MAX_KEYS * 0.9);
    for (const k of map.keys()) {
      if (drop-- <= 0) break;
      map.delete(k);
    }
  }
}

/** 창 안의 횟수 — 시각 목록(창 밖은 버린다) */
export class WindowCounter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    readonly windowMs: number,
    readonly max: number,
  ) {}

  private live(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  count(key: string, now = Date.now()): number {
    return this.live(key, now).length;
  }

  /** 한도에 닿았나(세기 전) */
  full(key: string, now = Date.now()): boolean {
    return this.count(key, now) >= this.max;
  }

  /** 다시 될 때까지(ms) — 한도 아래면 0 */
  retryMs(key: string, now = Date.now()): number {
    const list = this.live(key, now);
    if (list.length < this.max) return 0;
    return Math.max(0, list[list.length - this.max]! + this.windowMs - now);
  }

  add(key: string, now = Date.now()): void {
    trim(this.hits, (l) => l.some((t) => now - t < this.windowMs));
    const list = this.live(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  /** 세고, 한도 안이었나 */
  hit(key: string, now = Date.now()): boolean {
    if (this.full(key, now)) return false;
    this.add(key, now);
    return true;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }
}

/** n번 실패(창 안) → lockMs 동안 잠금 */
export class Lockout {
  private readonly fails: WindowCounter;
  private readonly locked = new Map<string, number>();
  constructor(
    windowMs: number,
    readonly max: number,
    readonly lockMs: number,
  ) {
    this.fails = new WindowCounter(windowMs, max);
  }

  /** 잠겨 있으면 남은 ms, 아니면 0 */
  lockedFor(key: string, now = Date.now()): number {
    const until = this.locked.get(key);
    if (until === undefined) return 0;
    if (until <= now) {
      this.locked.delete(key);
      return 0;
    }
    return until - now;
  }

  fail(key: string, now = Date.now()): void {
    this.fails.add(key, now);
    if (this.fails.count(key, now) >= this.max) {
      trim(this.locked, (u) => u > now);
      this.locked.set(key, now + this.lockMs);
      this.fails.reset(key);
    }
  }

  success(key: string): void {
    this.fails.reset(key);
  }
}

/** 초당 rate 개씩 차오르고 burst 개까지 담기는 통 */
export class TokenBucket {
  private tokens: number;
  private at: number;
  constructor(
    readonly rate: number,
    readonly burst: number,
    now = Date.now(),
  ) {
    this.tokens = burst;
    this.at = now;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class GateBusyError extends Error {
  constructor() {
    super('gate busy');
  }
}

/** 동시 실행 한도 + 대기 줄. 줄이 차면 GateBusyError */
export class Gate {
  private running = 0;
  private readonly queue: Array<() => void> = [];
  constructor(
    readonly concurrency: number,
    readonly queueMax: number,
  ) {}

  get stats(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.queue.length };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      if (this.queue.length >= this.queueMax) throw new GateBusyError();
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.running += 1;
    }
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next(); // 자리를 그대로 넘긴다(running 그대로)
      else this.running -= 1;
    }
  }
}

/** 지금 열린 수 */
export class Counter {
  private readonly n = new Map<string, number>();
  get(key: string): number {
    return this.n.get(key) ?? 0;
  }
  inc(key: string): number {
    const v = this.get(key) + 1;
    this.n.set(key, v);
    return v;
  }
  dec(key: string): void {
    const v = this.get(key) - 1;
    if (v > 0) this.n.set(key, v);
    else this.n.delete(key);
  }
}
