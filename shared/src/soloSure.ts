// =============================================================================
// ★★★ R125 — 혼자 하기 "맞힌 답도 바로 정답!" (찬종 2026-11-28: "미리 답을 준비해놓으면 서버 안거치고 바로바로 대응 되는거 아니야?")
//
//   서버는 문제마다 sure { salt, keys, wraps, box } 를 화면에 보낸다. 정답 글자는 보내지 않는다:
//   · keys  = 판정 열쇠 하나하나의 SHA-256(소금 + 열쇠) 앞 16바이트 — 되돌릴 수 없는 지문
//   · box   = 정답(대표 표기) · 해설을 한 번 쓰는 열쇠(contentKey)로 잠근 글 — 맞는 열쇠를 친 사람만 연다
//   · wraps = 열쇠마다 contentKey 를 그 열쇠로 덮은 값(keys 와 같은 순서)
//
//   ★★ 판정과 똑같다(상위 집합이 아니라 같다): 서버 판정(solo/engine soloAnswer)은
//     정규화 그대로 ∈ 정규화 정답(norms) · 또는 flexMatch = 표준형 ∈ (norms ∪ flex) · 끝맺음 뗀 꼴(2자 이상) ∈ (norms ∪ flex) — 전부 "집합에 드나" 뿐이다.
//     그래서 열쇠에 꼬리표를 붙인다 — 'n:' = norms 에만 견줌 · 'f:' = norms ∪ flex 에 견줌. 제출 꼬리표(submitTags) ∩ 정답 꼬리표(answerTags) ≠ ∅ ⇔ 서버가 맞다고 한다.
//     (느슨한 맞춤 · 오타 허용 같은 다른 길은 판정에 없다 — 01 10장 · answerFlex 머리)
//   ★ SHA-256 은 동기 구현(브라우저 SubtleCrypto 는 비동기라 Enter → 한 프레임 안에 못 바꾼다) · 서버도 같은 함수를 쓴다(두 쪽이 어긋날 수 없게).
// =============================================================================

import { normalizeAnswer } from './normalize.js';
import { flexCanon, stripEnding } from './answerFlex.js';

// ─── SHA-256 (FIPS 180-4) ────────────────────────────────────────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(msg: Uint8Array): Uint8Array {
  const len = msg.length;
  const blocks = Math.ceil((len + 9) / 64);
  const buf = new Uint8Array(blocks * 64);
  buf.set(msg);
  buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 8, Math.floor(bits / 0x1_0000_0000));
  dv.setUint32(buf.length - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let b = 0; b < blocks; b += 1) {
    for (let i = 0; i < 16; i += 1) W[i] = dv.getUint32(b * 64 + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const w15 = W[i - 15]!;
      const w2 = W[i - 2]!;
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }
    let a = H[0]!, bb = H[1]!, c = H[2]!, d = H[3]!, e = H[4]!, f = H[5]!, g = H[6]!, h = H[7]!;
    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + W[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const mj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = bb;
      bb = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + bb) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) ov.setUint32(i * 4, H[i]!);
  return out;
}

/** UTF-8 (shared 는 DOM lib 가 없어 TextEncoder 대신 직접) — 짝 없는 대리 글자는 U+FFFD */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}
export function fromUtf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i]!;
    let cp: number;
    if (x < 0x80) (cp = x), (i += 1);
    else if (x < 0xe0) (cp = ((x & 31) << 6) | (b[i + 1]! & 63)), (i += 2);
    else if (x < 0xf0) (cp = ((x & 15) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63)), (i += 3);
    else (cp = ((x & 7) << 18) | ((b[i + 1]! & 63) << 12) | ((b[i + 2]! & 63) << 6) | (b[i + 3]! & 63)), (i += 4);
    s += String.fromCodePoint(cp);
  }
  return s;
}
export function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
export function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length >> 1);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ─── 판정 꼬리표 ─────────────────────────────────────────────────────────────

/**
 * 제출의 꼬리표 — 서버 판정(soloAnswer)과 한 줄씩 같다:
 *   정규화가 빈 글이면 늘 틀림(빈 배열) · 'n:' 정규화 그대로 · 'f:' 표준형(1자 이상) · 'f:' 끝맺음 뗀 꼴의 정규화 · 표준형(2자 이상)
 */
export function submitTags(rawSub: string): string[] {
  const norm = normalizeAnswer(rawSub);
  if (!norm) return [];
  const out = new Set<string>([`n:${norm}`]);
  const c = flexCanon(rawSub);
  if (c.length >= 1) out.add(`f:${c}`);
  const e = stripEnding(rawSub);
  if (e !== rawSub) {
    for (const k of [normalizeAnswer(e), flexCanon(e)]) if (k.length >= 2) out.add(`f:${k}`);
  }
  return [...out];
}

/** 정답의 꼬리표 — 'n:' 정규화 정답 · 'f:' 정규화 ∪ 표준형 정답 */
export function answerTags(norms: ReadonlySet<string>, flex: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const k of norms) if (k) out.push(`n:${k}`);
  for (const k of new Set([...norms, ...flex])) if (k) out.push(`f:${k}`);
  return out;
}

// ─── 지문 · 잠근 상자 ─────────────────────────────────────────────────────────

export interface SoloSure {
  /** 문제마다 · 판마다 새 소금(hex 16바이트) */
  salt: string;
  /** 정답 꼬리표의 지문(hex 32자 = 16바이트) */
  keys: string[];
  /** keys 와 같은 순서 — contentKey XOR 그 꼬리표의 덮개(hex 32자) */
  wraps: string[];
  /** 정답 · 해설을 잠근 글(hex) */
  box: string;
}
export interface SoloSureOpen {
  answer: string;
  explanation: string | null;
}

const SURE_BYTES = 16;
const digest = (salt: string, dom: string, tag: string) => sha256(utf8(`${salt}\u0000${dom}\u0000${tag}`)).subarray(0, SURE_BYTES);
export const sureKey = (salt: string, tag: string) => toHex(digest(salt, 'k', tag));
const wrapPad = (salt: string, tag: string) => digest(salt, 'w', tag);

function keystream(key: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let ctr = 0, o = 0; o < n; ctr += 1) {
    const blk = new Uint8Array(key.length + 4);
    blk.set(key);
    new DataView(blk.buffer).setUint32(key.length, ctr);
    const h = sha256(blk);
    for (let i = 0; i < h.length && o < n; i += 1, o += 1) out[o] = h[i]!;
  }
  return out;
}
const xor = (a: Uint8Array, b: Uint8Array) => a.map((x, i) => x ^ b[i]!);

/** 서버 — 문제 하나의 sure 를 만든다(rand = 바이트 n 개의 무작위 · 서버는 crypto.randomBytes) */
export function makeSoloSure(tags: readonly string[], open: SoloSureOpen, rand: (n: number) => Uint8Array): SoloSure {
  const salt = toHex(rand(SURE_BYTES));
  const ck = rand(SURE_BYTES);
  const plain = utf8(JSON.stringify({ a: open.answer, e: open.explanation }));
  const box = toHex(xor(plain, keystream(ck, plain.length)));
  const keys: string[] = [];
  const wraps: string[] = [];
  for (const t of new Set(tags)) {
    keys.push(sureKey(salt, t));
    wraps.push(toHex(xor(ck, wrapPad(salt, t))));
  }
  return { salt, keys, wraps, box };
}

/** 화면 — 친 답이 맞으면 상자를 열어 정답 · 해설을 돌려준다 · 아니면 null(= 서버도 틀렸다고 한다) */
export function openSoloSure(sure: SoloSure, rawSub: string): SoloSureOpen | null {
  const idx = new Map(sure.keys.map((k, i) => [k, i]));
  for (const t of submitTags(rawSub)) {
    const i = idx.get(sureKey(sure.salt, t));
    if (i === undefined) continue;
    const ck = xor(fromHex(sure.wraps[i]!), wrapPad(sure.salt, t));
    const enc = fromHex(sure.box);
    try {
      const o = JSON.parse(fromUtf8(xor(enc, keystream(ck, enc.length)))) as { a: string; e: string | null };
      return { answer: o.a, explanation: o.e ?? null };
    } catch {
      return null;
    }
  }
  return null;
}

/** 서버 — 이 제출이 sure 에 걸리나(어긋남 기록용 · 판정은 하지 않는다) */
export function sureHit(sure: SoloSure, rawSub: string): boolean {
  const set = new Set(sure.keys);
  return submitTags(rawSub).some((t) => set.has(sureKey(sure.salt, t)));
}
