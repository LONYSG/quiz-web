// =============================================================================
// ★★★ 캐치마인드 (R083 · D-330 ⑵ ⑷ · D-340) — 방 "방식" 의 하나(퀴즈 / 미니게임만 / 라이어 / 캐치마인드)
//
// ★ 찬종 2026-11-08: "캐치마인드 · 라이어 게임은 미니게임이 아니라 방 설정 '방식' 에 추가 … 캐치마인드 그리기 자리는 채팅창을 줄여 확보"
// ★ 출제자가 돌아가며 그림 · 나머지는 채팅으로 정답(퀴즈 판정 그대로) · 숫자는 전부 여기 한 곳.
// =============================================================================

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

export function isDrawColor(v: unknown): v is DrawColor {
  return v === 'erase' || (typeof v === 'string' && (DRAW_COLORS as readonly string[]).includes(v));
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

/** 글자 수 힌트 — "○○ ○○○ · 5글자(띄어쓰기 있음)" */
export function drawLengthPattern(keyword: string): string {
  const chars = [...keyword.trim()];
  const pattern = chars.map((c) => (/\s/.test(c) ? ' ' : '○')).join('').replace(/ +/g, ' ');
  const n = chars.filter((c) => !/\s/.test(c)).length;
  return `${pattern} · ${n}글자${chars.some((c) => /\s/.test(c)) ? '(띄어쓰기 있음)' : ''}`;
}
