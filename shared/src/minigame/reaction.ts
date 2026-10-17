// =============================================================================
// ★★★ 번개손 (R051 · D-237) — 초록 화면 반응속도 + 퀵드로우(가짜 신호 · 먼저 누르면 실격)
//
// ★ 찬종: "초록 화면 반응속도 + 퀵드로우(가짜 신호 · 먼저 누르면 실격)".
// ★ 5판. 판마다 빨간 "준비…" → 무작위 1.5~5초 뒤 **초록 + 소리**(진짜 신호) → Space · Enter · 탭 한 번. 값 = 반응 ms(작을수록 좋다).
//   판 1~2 는 순수 반응 · 판 3~5 는 퀵드로우 — 진짜 신호 전에 **가짜 신호 1~2회**(색만 · 소리만 · 글자만 — 진짜는 초록과 소리가 동시).
//   초록 전에 누르면 그 판 "성급!" · 가짜에 누르면 "속았다!" — 둘 다 실격(꼴찌 · 값 없음). 신호 뒤 2초 안에 안 누르면 미제출(꼴찌).
// ★ 설계 판단(되돌리기 쉽다):
//   · 가짜 "색만" 은 **초록이 아닌 색**(노랑)으로 바뀐다 — 소리를 끈 폰은 "초록인데 소리 없음" 을 가릴 수 없다(불공정).
//     그래서 진짜 신호는 **초록만으로도** 알 수 있다 · 소리는 덤이다.
//   · 신호 뒤 100ms 안에 누른 것도 "성급"(사람 반응의 바닥 — 육상 부정 출발 기준과 같다). 신호 시각을 미리 아는 조작도 이걸로 막는다.
//   · 퀵드로우 판의 진짜 신호는 2.6~5초(가짜가 들어갈 틈) · 가짜끼리 · 가짜와 진짜는 0.7초 이상 떨어진다.
// ★ 측정은 기기 시간(케이크와 같다) — 판 시작 신호를 받은 순간부터. 서버는 "흐른 시간 + 250ms" 를 넘는 값을 거른다.
// =============================================================================

import { seededRandom } from '../balance.js';

export const REACTION_ROUNDS = 5;
/** 판 1~2 순수 반응 · 판 3~5 퀵드로우 */
export const REACTION_PURE_ROUNDS = 2;
export const REACTION_SIGNAL_MIN_MS = 1_500;
export const REACTION_SIGNAL_MAX_MS = 5_000;
export const REACTION_QUICKDRAW_SIGNAL_MIN_MS = 2_600;
/** 진짜 신호 뒤 누를 수 있는 시간 */
export const REACTION_WINDOW_MS = 2_000;
/** 신호 뒤 이보다 빠르면 "성급" (예측해서 누름) */
export const REACTION_MIN_HUMAN_MS = 100;
/** 가짜 신호가 보이는(들리는) 길이 */
export const REACTION_FAKE_SHOW_MS = 450;
/** 가짜 신호 시작 뒤 이 안에 누르면 "속았다"(그 밖이면 그냥 "성급") */
export const REACTION_FAKE_BLAME_MS = 1_000;
const GAP_MS = 700;
const FIRST_FAKE_MIN_MS = 800;

export type ReactionFakeKind = 'color' | 'sound' | 'text';
export const REACTION_FAKE_KINDS: readonly ReactionFakeKind[] = ['color', 'sound', 'text'];

export interface ReactionFake {
  /** 판 시작부터 ms */
  atMs: number;
  kind: ReactionFakeKind;
}

export interface ReactionRound {
  quickdraw: boolean;
  /** 진짜 신호 — 판 시작부터 ms */
  signalMs: number;
  fakes: ReactionFake[];
}

/** 판 구성 — 같은 시드면 같은 판. 퀵드로우 세 판의 첫 가짜는 세 종류가 한 번씩(섞어서) */
export function reactionRounds(seed: number): ReactionRound[] {
  const rnd = seededRandom((seed ^ 0x5eac7) >>> 0);
  const firstKinds = [...REACTION_FAKE_KINDS];
  for (let i = firstKinds.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [firstKinds[i], firstKinds[j]] = [firstKinds[j]!, firstKinds[i]!];
  }
  const out: ReactionRound[] = [];
  for (let r = 0; r < REACTION_ROUNDS; r += 1) {
    if (r < REACTION_PURE_ROUNDS) {
      out.push({ quickdraw: false, signalMs: Math.round(REACTION_SIGNAL_MIN_MS + rnd() * (REACTION_SIGNAL_MAX_MS - REACTION_SIGNAL_MIN_MS)), fakes: [] });
      continue;
    }
    const signalMs = Math.round(REACTION_QUICKDRAW_SIGNAL_MIN_MS + rnd() * (REACTION_SIGNAL_MAX_MS - REACTION_QUICKDRAW_SIGNAL_MIN_MS));
    const k0 = firstKinds[(r - REACTION_PURE_ROUNDS) % firstKinds.length]!;
    const latest = signalMs - GAP_MS;
    // 가짜 둘이 들어갈 틈이 있고 반쯤의 확률이면 둘
    const two = latest - FIRST_FAKE_MIN_MS >= GAP_MS && rnd() < 0.5;
    const fakes: ReactionFake[] = [];
    if (two) {
      const a = Math.round(FIRST_FAKE_MIN_MS + rnd() * (latest - GAP_MS - FIRST_FAKE_MIN_MS));
      const b = Math.round(a + GAP_MS + rnd() * (latest - a - GAP_MS));
      const others = REACTION_FAKE_KINDS.filter((k) => k !== k0);
      fakes.push({ atMs: a, kind: k0 }, { atMs: b, kind: others[Math.floor(rnd() * others.length)]! });
    } else {
      fakes.push({ atMs: Math.round(FIRST_FAKE_MIN_MS + rnd() * (latest - FIRST_FAKE_MIN_MS)), kind: k0 });
    }
    out.push({ quickdraw: true, signalMs, fakes });
  }
  return out;
}

export type ReactionFoul = 'early' | 'fake';

export interface ReactionJudge {
  /** 실격이면 null */
  reactMs: number | null;
  foul: ReactionFoul | null;
  /** 속은 가짜 신호 종류 */
  fakeKind: ReactionFakeKind | null;
}

/** 누른 시각(판 시작부터 기기 ms) → 판정 */
export function reactionJudge(round: Pick<ReactionRound, 'signalMs' | 'fakes'>, pressedAtMs: number): ReactionJudge {
  const react = pressedAtMs - round.signalMs;
  if (react >= REACTION_MIN_HUMAN_MS) return { reactMs: Math.round(react), foul: null, fakeKind: null };
  const fake = [...round.fakes]
    .reverse()
    .find((f) => pressedAtMs >= f.atMs && pressedAtMs < f.atMs + REACTION_FAKE_BLAME_MS && pressedAtMs < round.signalMs);
  if (fake) return { reactMs: null, foul: 'fake', fakeKind: fake.kind };
  return { reactMs: null, foul: 'early', fakeKind: null };
}

/** 판 길이(실제 ms) — 진짜 신호 + 누를 수 있는 시간 */
export function reactionPlayMs(round: Pick<ReactionRound, 'signalMs'>): number {
  return round.signalMs + REACTION_WINDOW_MS;
}
