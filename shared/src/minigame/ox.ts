// =============================================================================
// ★★★ R085 — OX 10연속 (D-342 · docs/18 §11 · 찬종 2026-11-08 ⑴ "OX 퀴즈 — 문장은 새로 생성")
//
// ★ 문장 10 · 문장마다 5초 · O / X 두 버튼(바꿀 수 있음 — 마지막) · 맞히면 1 · 같으면 맞힌 문장 시간 합(choice 꼴).
// ★ 고르기: 앞 5 = grade 1 · 뒤 5 = grade 2 · 3 섞기(모자라면 다른 grade 로 채움) · 같은 pairId 둘 금지 · 같은 대분류 ≤ 3 ·
//   참가자 중 본 사람 적은 문장 먼저(경험 'ox|<id>' · 전원 본 것은 뒤로 — 모자라면 그것도) · 이번 게임에서 쓴 문장 피함.
// ★ 이 파일은 순수 함수 · 상수만(서버 고르기 · 화면 표시).
// =============================================================================

import { seededRandom } from '../balance.js';

export const OX_COUNT = 10;
/** 앞쪽 쉬운 문장 수(grade 1) */
export const OX_EASY_FIRST = 5;
export const OX_PLAY_MS = 5_000;
export const OX_READY_MS = 300;
/** 문장마다 정답 공개(정답 · 해설 한 줄) */
export const OX_REVEAL_MS = 2_500;
/** 같은 대분류 상한 */
export const OX_MAX_PER_L1 = 3;

export interface OxLite {
  id: string;
  grade: number;
  l1: string;
  pairId: string | null;
}

export interface OxPickResult<T> {
  items: T[];
  /** 문장 id → 이미 본 참가자 */
  experiencedBy: Map<string, string[]>;
}

/**
 * ★ 10 문장 고르기. seen(계정, id) = 그 사람이 본 문장인가 · avoid = 이번 게임에서 쓴 문장 id.
 *   점수(작을수록 먼저) = 본 사람 수 · 이번 게임에서 씀 +100 · 전원 봄 +1000(ignoreSeen 이 아니면 마지막 수단) · 같은 점수는 시드 순.
 *   앞 5 는 grade 1 에서 · 뒤 5 는 grade 2 · 3 에서 — 그 칸이 모자라면 다른 grade 에서 채운다. 쌍 · 대분류 상한은 늘 지킨다(모자라면 대분류 상한만 푼다).
 */
export function pickOxItems<T extends OxLite>(
  pool: readonly T[],
  participants: readonly string[],
  seen: (accountId: string, id: string) => boolean,
  seed: number,
  opts: { avoid?: ReadonlySet<string>; count?: number; easyFirst?: number } = {},
): OxPickResult<T> | null {
  const count = opts.count ?? OX_COUNT;
  const easyN = Math.min(opts.easyFirst ?? OX_EASY_FIRST, count);
  if (pool.length < count) return null;
  const rnd = seededRandom((seed ^ 0x0a0b) >>> 0);
  const scored = pool.map((it) => {
    const who = participants.filter((a) => seen(a, it.id));
    const all = participants.length > 0 && who.length === participants.length;
    return { it, who, s: who.length + (opts.avoid?.has(it.id) ? 100 : 0) + (all ? 1000 : 0), r: rnd() };
  });
  scored.sort((a, b) => a.s - b.s || a.r - b.r);
  const chosen: typeof scored = [];
  const pairs = new Set<string>();
  const perL1 = new Map<string, number>();
  const can = (x: (typeof scored)[number], l1Cap: boolean) =>
    !chosen.includes(x) && !(x.it.pairId && pairs.has(x.it.pairId)) && (!l1Cap || (perL1.get(x.it.l1) ?? 0) < OX_MAX_PER_L1);
  const take = (x: (typeof scored)[number]) => {
    chosen.push(x);
    if (x.it.pairId) pairs.add(x.it.pairId);
    perL1.set(x.it.l1, (perL1.get(x.it.l1) ?? 0) + 1);
  };
  const fill = (want: number, pred: (x: (typeof scored)[number]) => boolean) => {
    for (const l1Cap of [true, false]) {
      for (const x of scored) {
        if (chosen.length >= want) return;
        if (pred(x) && can(x, l1Cap)) take(x);
      }
    }
  };
  // 앞 5 = grade 1 (모자라면 grade 2 → 아무거나)
  fill(easyN, (x) => x.it.grade === 1);
  fill(easyN, (x) => x.it.grade === 2);
  fill(easyN, () => true);
  // 뒤 5 = grade 2 · 3 섞기 (모자라면 아무거나)
  fill(count, (x) => x.it.grade >= 2);
  fill(count, () => true);
  if (chosen.length < count) return null;
  // 뒤 5 안은 섞는다(grade 2 · 3 이 고르게) · 앞 5 는 고른 순
  const back = chosen.slice(easyN).sort((a, b) => a.r - b.r);
  const out = [...chosen.slice(0, easyN), ...back];
  return { items: out.map((x) => x.it), experiencedBy: new Map(out.filter((x) => x.who.length > 0).map((x) => [x.it.id, x.who])) };
}

/** ★ 연습 판 — 누가 봐도 연습 문장(스포 없음) */
export const OX_DUMMY = [
  { id: 'dummy-ox-1', statement: '연습 문장 — 1 더하기 1 은 2 이다.', answer: true, explanation: '연습이에요. 1 + 1 = 2.', l1: '연습' },
  { id: 'dummy-ox-2', statement: '연습 문장 — 일주일은 8일이다.', answer: false, explanation: '연습이에요. 실제로는 7일이다.', l1: '연습' },
  { id: 'dummy-ox-3', statement: '연습 문장 — 물은 0°C 에서 언다(1기압).', answer: true, explanation: '연습이에요. 1기압에서 물의 어는점은 0°C 다.', l1: '연습' },
] as const;
