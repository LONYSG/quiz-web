// =============================================================================
// ★★★ 캐치마인드 (R083 · D-330 ⑵ ⑷ · D-340) — 방 "방식" 의 하나(퀴즈 / 미니게임만 / 라이어 / 캐치마인드)
//
// ★ 찬종 2026-11-08: "캐치마인드 · 라이어 게임은 미니게임이 아니라 방 설정 '방식' 에 추가 … 캐치마인드 그리기 자리는 채팅창을 줄여 확보"
// ★ 출제자가 돌아가며 그림 · 나머지는 채팅으로 정답(퀴즈 판정 그대로) · 숫자는 전부 여기 한 곳.
// =============================================================================

import { generateHint } from './hint.js';

export const DRAW = {
  MIN_PLAYERS: 2,
  ROUNDS: { MIN: 2, MAX: 10, DEFAULT: 5 },
  /** 그리기 시간 · 공개 · "다른 제시어" 가능 시간(처음부터) */
  ROUND_MS: 90_000,
  REVEAL_MS: 5_000,
  REROLL_MS: 10_000,
  /** 논리 좌표(0~SIZE · 정사각 · 기기 크기 무관) */
  SIZE: 1000,
  /** 선 하나 점 수 · 한 라운드 선 수 · 한 조각 점 수 상한(서버 보호) */
  MAX_POINTS: 2000,
  MAX_STROKES: 600,
  /** ★ R090 (D-347) — 되돌리기 · 다시 실행 보관 op 합 상한(전체 지우기 때 보관한 목록 + 다시 실행 대기) — 넘으면 가장 오래된 보관분부터 버림(그 되돌리기는 못 함) */
  HISTORY_MAX_OPS: 3000,
  MAX_CHUNK: 400,
  /** 그리는 중 조각을 보내는 간격(ms) — ★ R087 (D-344 · 찬종 "선이 뚝뚝 끊겨") 200 → 50 */
  CHUNK_MS: 50,
  /** 맞힌 순서 점수(3 · 2 · 1 · 그 뒤 1) · 출제자 = 맞힌 사람 수(상한) */
  SOLVER_SCORES: [3, 2, 1] as readonly number[],
  SOLVER_MIN: 1,
  DRAWER_MAX: 3,
  /** ★ R088 (D-345 · 18 §12 "캐치마인드는 한 판에 섞는다") — 한 판의 diff 1 : 2 : 3 비율(세트 무관) · diff 없는 항목은 2 로 본다 */
  DIFF_MIX: [4, 4, 2] as readonly number[],
} as const;

/**
 * ★ R088 — 라운드 n 개의 난이도 계획(1 · 2 · 3) — DIFF_MIX 비율로 나눈 뒤(큰 나머지 순) 섞는다.
 *   rnd: 0~1 난수(검사에서 고정)
 */
export function drawDiffPlan(rounds: number, rnd: () => number = Math.random): number[] {
  const mix = DRAW.DIFF_MIX;
  const total = mix.reduce((a, b) => a + b, 0);
  const exact = mix.map((w) => (w / total) * rounds);
  const n = exact.map((x) => Math.floor(x));
  let left = rounds - n.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    n[o.i]! += 1;
    left -= 1;
  }
  const out: number[] = [];
  n.forEach((k, i) => {
    for (let j = 0; j < k; j += 1) out.push(i + 1);
  });
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export const DRAW_COLORS = ['#111111', '#e5383b', '#2563eb', '#16a34a'] as const;
export type DrawColor = (typeof DRAW_COLORS)[number] | 'erase';
export const DRAW_WIDTHS = [6, 18] as const;

export const DRAW_START_BLOCK = `캐치마인드는 ${DRAW.MIN_PLAYERS}명부터 할 수 있어요.`;
export const DRAW_TEAM_BLOCK = '팀전과 캐치마인드는 같이 켤 수 없어요.';

/** ★ R089 (D-346) — 색은 팔레트 밖도(세부 색 · 스포이드) → '#rrggbb' 아무거나 · 'erase' = 흰색 선 */
export function isDrawColor(v: unknown): v is DrawColor {
  return v === 'erase' || (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v));
}

// ── ★★ R089 (D-346 · 찬종 "펜 굵기 · 되돌리기 · 색 팔레트 + 세부 색 · 지우개 굵기 · 페인트통 · 스포이드") ──
/** 기본 팔레트 12 */
export const DRAW_PALETTE = ['#111111', '#8a8a8a', '#ffffff', '#e5383b', '#f7871f', '#f6c90e', '#16a34a', '#38bdf8', '#2563eb', '#8b5cf6', '#ec4899', '#8b5a2b'] as const;
/** 펜 · 지우개 굵기 단계(공용 격자 1000 기준 px) */
export const DRAW_WIDTH_STEPS = [2, 4, 8, 14, 24] as const;
/** 페인트통 경계 허용 오차(채널 최대 차) — 안티앨리어싱 가장자리를 같이 칠한다 */
export const DRAW_FILL_TOL = 40;
/** 지우개 = 흰색으로 칠한다(공용 격자는 흰 바탕 — 페인트통이 지운 자리도 같은 색으로 본다) */
export const DRAW_ERASE_HEX = '#ffffff';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex === 'erase' ? DRAW_ERASE_HEX : hex;
  const n = Number.parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * ★ R089 — 영역 채우기(4-연결 · 스캔라인) — 공용 격자 RGBA 를 제자리에서 바꾼다 · 칠한 픽셀 수.
 *   시작 픽셀 색과 채널 최대 차가 tol 이하인 픽셀을 이어서 칠한다(같은 색이면 0). 순수 함수 — 같은 입력이면 어느 기기에서나 같은 결과.
 */
export function floodFill(data: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, rgb: readonly [number, number, number], tol: number = DRAW_FILL_TOL): number {
  const x = Math.max(0, Math.min(w - 1, Math.floor(x0)));
  const y = Math.max(0, Math.min(h - 1, Math.floor(y0)));
  const i0 = (y * w + x) * 4;
  const sr = data[i0]!;
  const sg = data[i0 + 1]!;
  const sb = data[i0 + 2]!;
  const [fr, fg, fb] = rgb;
  if (sr === fr && sg === fg && sb === fb) return 0;
  const seen = new Uint8Array(w * h);
  const match = (p: number) => {
    if (seen[p]) return false;
    const i = p * 4;
    return Math.abs(data[i]! - sr) <= tol && Math.abs(data[i + 1]! - sg) <= tol && Math.abs(data[i + 2]! - sb) <= tol;
  };
  const paint = (p: number) => {
    seen[p] = 1;
    const i = p * 4;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = 255;
  };
  let n = 0;
  const stack: number[] = [x, y];
  while (stack.length) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    let lx = cx;
    const row = cy * w;
    if (!match(row + lx)) continue;
    while (lx > 0 && match(row + lx - 1)) lx -= 1;
    let rx = cx;
    while (rx < w - 1 && match(row + rx + 1)) rx += 1;
    for (let xx = lx; xx <= rx; xx += 1) {
      paint(row + xx);
      n += 1;
    }
    for (const ny of [cy - 1, cy + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let xx = lx;
      while (xx <= rx) {
        while (xx <= rx && !match(nrow + xx)) xx += 1;
        if (xx > rx) break;
        stack.push(xx, ny);
        while (xx <= rx && match(nrow + xx)) xx += 1;
      }
    }
  }
  return n;
}

/** ★ R089 — 격자 해시(FNV-1a · 검사에서 두 화면의 결과가 같은지) */
export function gridHash(data: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    h ^= data[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 맞힌 순서(0부터) → 점수 */
export function drawSolverScore(order: number): number {
  return DRAW.SOLVER_SCORES[order] ?? DRAW.SOLVER_MIN;
}

/** 출제자 점수 = 맞힌 사람 수(상한) */
export function drawDrawerScore(solved: number): number {
  return Math.min(DRAW.DRAWER_MAX, solved);
}

/** 점 배열 검사 — [x, y, x, y, …] 정수 0~SIZE · 짝수 길이 · 상한 */
export function drawPointsOk(pts: unknown, max: number = DRAW.MAX_CHUNK): pts is number[] {
  return (
    Array.isArray(pts) &&
    pts.length >= 2 &&
    pts.length % 2 === 0 &&
    pts.length <= max * 2 &&
    pts.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= DRAW.SIZE)
  );
}

/** ★ 출제자 채팅의 "글자 수 힌트"(3글자 · 세 글자 · 2음절 …) */
export function drawLengthHint(text: string): boolean {
  return /[0-9]+\s*(글자|자|음절)|(한|두|세|네|다섯|여섯|일곱|여덟)\s*(글자|음절)/.test(text);
}

// ★★ R087 (D-344 · 찬종 "그리는 사람이 글자수 공개/초성 공개/주제 공개를 할 수 있는 버튼") — 출제자 힌트 셋 · 각 1회 · 패널티 없음
//   주제는 기본 숨김(버튼 뜻이 있게) · 출제자 채팅의 글자 수 힌트 거부는 그대로(힌트는 버튼으로만)
export type DrawHintKind = 'length' | 'initial' | 'topic';
export const DRAW_HINT_KINDS: readonly DrawHintKind[] = ['length', 'initial', 'topic'];
export const DRAW_HINT_LABEL: Record<DrawHintKind, string> = { length: '글자 수', initial: '초성', topic: '주제' };
export function isDrawHintKind(v: unknown): v is DrawHintKind {
  return typeof v === 'string' && (DRAW_HINT_KINDS as readonly string[]).includes(v);
}

/**
 * ★★ R095 (D-352 · 찬종 제보 #116 "캐치마인드 초성이 왜 한 글자만 나와?") — 초성 힌트 = **제시어 전체 초성**(D-344 "첫 글자" 개정)
 * 퀴즈 초성과 같은 함수(generateHint)를 **낱말마다** 불러 띄어쓰기를 남긴다: "구두" → "ㄱㄷ" · "라이온 킹" → "ㄹㅇㅇ ㅋ" · "Big Ben" → "B__ B__"
 * 숫자는 "_"(표시 쪽이 hintKind 로 "숫자 n자리") · 힌트를 못 만드는 한 글자 낱말(영문 · 숫자 · 기호)은 "_"(정답을 그대로 보이지 않게)
 */
export function drawInitials(keyword: string): string {
  return keyword
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => generateHint(w) ?? '_')
    .join(' ');
}

/** 글자 수 힌트 — "○○ ○○○ · 5글자(띄어쓰기 있음)" */
export function drawLengthPattern(keyword: string): string {
  const chars = [...keyword.trim()];
  const pattern = chars.map((c) => (/\s/.test(c) ? ' ' : '○')).join('').replace(/ +/g, ' ');
  const n = chars.filter((c) => !/\s/.test(c)).length;
  return `${pattern} · ${n}글자${chars.some((c) => /\s/.test(c)) ? '(띄어쓰기 있음)' : ''}`;
}
