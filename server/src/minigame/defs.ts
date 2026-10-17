// =============================================================================
// ★★★ 미니게임 플러그인 (R050 · D-234) — 미니게임 하나 = 안내(shared MINIGAMES) · 판 만들기 · 입력 검사 · 판 채점 · 화면 컴포넌트(client)
//
// ★ 새 미니게임을 더할 때: shared/minigame.ts 에 키 · 정보 → 여기 MinigameDef 하나 → client/src/minigame/ 에 화면 하나.
//   엔진(engine.ts)은 미니게임 이름을 모른다 — 진행 · 순위 · 보상 · 기록은 공통이다.
// ★ 판정 값(value)은 서버가 계산한다. 클라이언트가 보낸 것은 "입력 원값" 뿐이다(케이크 = 누른 순간까지 걸린 ms · 균형 = 점 두 개).
// ★ 퀴즈류(🧠 — R052~)는 kind 'quiz' 와 items(경험 시스템)를 쓴다. R050 두 게임 · R051 네 게임(번개손 · 타자 · 완벽한 원 · 각도)은 피지컬 · 감각류(🤸 — 반복 허용)라 쓰지 않는다.
// =============================================================================

import {
  ANGLE_PLAY_MS,
  BALANCE_PLAY_MS,
  CIRCLE_PLAY_MS,
  TYPING_MIN_MS_PER_CHAR,
  TYPING_PLAY_MS,
  TYPING_UNFINISHED_BASE,
  angleError,
  angleStart,
  angleTargets,
  circlePointsProblem,
  circleScore,
  circleThumb,
  clampAngle,
  reactionJudge,
  reactionPlayMs,
  reactionRounds,
  typingComplete,
  typingLength,
  typingNorm,
  typingProgress,
  typingRounds,
  CAKE_LATE_MS,
  CAKE_ROUNDS,
  balanceItem,
  balanceRoundKinds,
  balanceSplit,
  balanceStart,
  cakePlayMs,
  cakeTargetMs,
  clampCutX,
  minigameInfo,
  type MinigameInfo,
  type MinigameKey,
  type ReactionFake,
} from '@quiz/shared';

export interface RoundSpec {
  /** 항목 · 패턴 키 (기록 · 퀴즈류의 경험 기록에 쓴다) */
  itemKey: string;
  /** 모두에게 공개하는 판 설정 (화면이 그린다) */
  params: Record<string, unknown>;
  /** 판 길이(ms) — 이 시간이 지나면(+ 지연 여유) 마감 */
  playMs: number;
  /** 이 판의 시드 */
  seed: number;
}

export interface ParsedInput {
  /** 기록에 남길 입력 원값 */
  input: Record<string, unknown>;
  /** ★ 순위 값 (info.better 방향). null = 그 판 실격 · 값 없음(번개손 "성급") — 꼴찌 · 0점 */
  value: number | null;
  /** 기록의 submitted 칸 (없으면 true). 타자 미완은 false — 진행률로 순위만 매긴다 */
  submitted?: boolean;
  /** 표시 · 기록용 부가 값 (케이크 = 부호 있는 오차 초 · 균형 = 한쪽 %) */
  error: number | null;
  /** 걸린 ms (있으면) */
  elapsedMs: number | null;
  /** 화면에 보여 줄 덧붙임 (균형 = 자른 선). ★ extra.unfinished = true 면 표 소수 자리 계산에서 뺀다(타자 미완) */
  extra?: Record<string, unknown>;
}

export interface MinigameDef {
  key: MinigameKey;
  info: MinigameInfo;
  /** 판 구성 (시드로 — 같은 시드면 같은 판) */
  buildRounds(seed: number): RoundSpec[];
  /** 사람마다 다른 공개 값 (균형 = 시작 점). 없으면 null */
  privateFor?(spec: RoundSpec, accountId: string, roundIndex: number): Record<string, unknown> | null;
  /**
   * ★ 입력 검사 · 판정 값 계산 (서버). 이상한 값이면 null(받지 않음).
   *   provisional = true 면 "아직 확정 아님"(균형 — 움직이는 동안 보내는 값 · 마감 때 마지막 것을 쓴다)
   */
  parseInput(raw: unknown, spec: RoundSpec, ctx: { serverElapsedMs: number }): (ParsedInput & { provisional: boolean }) | null;
}

/** ★ 케이크 — 기기 시간이 서버에서 흐른 시간보다 이만큼까지는 길어도 받는다 (시계 잡음) */
export const CAKE_EARLY_TOLERANCE_MS = 250;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ─────────────────────────────────────────────────────────────────────────────
// 케이크 기다리기 — 각자 기기에서 "판 시작 신호를 받은 때부터 누른 때까지" 를 잰다(performance.now).
//   ★ 네트워크 지연은 받는 순간 · 보내는 순간에만 끼고 잰 시간에는 끼지 않는다(타이밍 공정성 — 봇 cakelag).
//   서버는 이상값(음수 · 판 길이 넘음)만 거른다.
// ─────────────────────────────────────────────────────────────────────────────
const cake: MinigameDef = {
  key: 'cake',
  info: minigameInfo('cake'),
  buildRounds(seed) {
    return CAKE_ROUNDS.map((r, i) => ({
      itemKey: `cake-${r.durationSec}s-x${r.speed}`,
      params: { durationSec: r.durationSec, speed: r.speed, hideAfterSec: r.hideAfterSec, targetMs: cakeTargetMs(r), lateMs: CAKE_LATE_MS, rhythmSeed: (seed + i * 101) % 1000 },
      playMs: cakePlayMs(r),
      seed: seed + i,
    }));
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const elapsed = num(obj?.elapsedMs);
    if (elapsed === null || elapsed < 0 || elapsed > spec.playMs + 200) return null;
    // ★★ 실제로 흐른 것보다 긴 시간은 받지 않는다 (미리 계산해 보내기 막기).
    //   네트워크 지연은 기기 쪽 시간을 **짧게**만 만든다(늦게 받고 · 늦게 도착) — 정직한 느린 기기는 걸리지 않는다. 시계 잡음 여유 250ms
    if (elapsed > ctx.serverElapsedMs + CAKE_EARLY_TOLERANCE_MS) return null;
    const target = Number(spec.params.targetMs);
    const err = (elapsed - target) / 1000;
    return { input: { elapsedMs: Math.round(elapsed * 10) / 10 }, value: Math.abs(err), error: err, elapsedMs: elapsed, provisional: false };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 균형의수호자 — 판마다 같은 물건(시드) · 사람마다 다른 시작 점 · 마감 때 마지막 위치로 서버가 넓이를 계산
// ─────────────────────────────────────────────────────────────────────────────
const balance: MinigameDef = {
  key: 'balance',
  info: minigameInfo('balance'),
  buildRounds(seed) {
    const kinds = balanceRoundKinds(seed);
    return kinds.map((kind, i) => {
      const s = (seed * 31 + i * 7919) >>> 0;
      const item = balanceItem(kind, s);
      return { itemKey: `${kind}-${s}`, params: { kind, itemSeed: s, label: item.label }, playMs: BALANCE_PLAY_MS, seed: s };
    });
  },
  privateFor(spec, accountId, roundIndex) {
    return { start: balanceStart(spec.seed, accountId, roundIndex) };
  },
  parseInput(raw, spec) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const top = num(obj?.top);
    const bottom = num(obj?.bottom);
    if (top === null || bottom === null || top < 0 || top > 100 || bottom < 0 || bottom > 100) return null;
    const cut = { top: clampCutX(top), bottom: clampCutX(bottom) };
    const item = balanceItem(String(spec.params.kind) as Parameters<typeof balanceItem>[0], spec.seed);
    const s = balanceSplit(item, cut);
    const elapsed = num(obj?.elapsedMs);
    return {
      input: { top: cut.top, bottom: cut.bottom },
      value: s.smallPct,
      error: s.aPct,
      elapsedMs: elapsed,
      extra: { top: cut.top, bottom: cut.bottom, aPct: s.aPct, bPct: s.bPct },
      provisional: obj?.final !== true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ R051 — 미니게임 2차 (피지컬류 넷 · 측정은 모두 기기 시간 · 서버는 "흐른 시간 + 250ms" 상한)
// ─────────────────────────────────────────────────────────────────────────────

/** 기기 시간 공통 검사 — 음수 · 판 길이 넘음 · 실제로 흐른 것보다 긴 값(미리 계산해 보내기) 거부 */
function deviceElapsed(obj: Record<string, unknown> | null, spec: RoundSpec, ctx: { serverElapsedMs: number }): number | null {
  const elapsed = num(obj?.elapsedMs);
  if (elapsed === null || elapsed < 0 || elapsed > spec.playMs + 200) return null;
  if (elapsed > ctx.serverElapsedMs + CAKE_EARLY_TOLERANCE_MS) return null;
  return elapsed;
}

// 번개손 — 누른 순간(판 시작부터 기기 ms) 하나만 받는다. 판정(성급 · 속음 · 반응 ms)은 서버가 판 구성으로 한다
const reaction: MinigameDef = {
  key: 'reaction',
  info: minigameInfo('reaction'),
  buildRounds(seed) {
    return reactionRounds(seed).map((r, i) => ({
      itemKey: `reaction-${r.quickdraw ? 'qd' : 'pure'}-${i + 1}`,
      params: { quickdraw: r.quickdraw, signalMs: r.signalMs, fakes: r.fakes, windowMs: reactionPlayMs(r) - r.signalMs },
      playMs: reactionPlayMs(r),
      seed: seed + i,
    }));
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const elapsed = deviceElapsed(obj, spec, ctx);
    if (elapsed === null) return null;
    const j = reactionJudge({ signalMs: Number(spec.params.signalMs), fakes: spec.params.fakes as ReactionFake[] }, elapsed);
    return {
      input: { elapsedMs: Math.round(elapsed * 10) / 10 },
      value: j.reactMs,
      error: j.reactMs,
      elapsedMs: elapsed,
      extra: { reactMs: j.reactMs, foul: j.foul, fakeKind: j.fakeKind },
      provisional: false,
    };
  },
};

// 타자 — 완성(final) 때 친 글 + 걸린 ms · 치는 동안은 진행 글(임시 — 못 끝내면 마감 때 진행률로)
const typing: MinigameDef = {
  key: 'typing',
  info: minigameInfo('typing'),
  buildRounds(seed) {
    return typingRounds(seed).map((r, i) => ({
      itemKey: `typing-${r.lang}-${r.size}-${r.index}`,
      params: { lang: r.lang, size: r.size, text: r.text },
      playMs: TYPING_PLAY_MS,
      seed: seed + i,
    }));
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const text = typeof obj?.text === 'string' ? obj.text.slice(0, 200) : null;
    if (text === null) return null;
    const target = String(spec.params.text);
    if (obj?.final === true) {
      if (!typingComplete(target, text)) return null;
      const elapsed = deviceElapsed(obj, spec, ctx);
      if (elapsed === null) return null;
      // ★ 사람 손으로 불가능한 속도 = 붙여넣기 · 조작
      if (elapsed < typingLength(target) * TYPING_MIN_MS_PER_CHAR) return null;
      const sec = elapsed / 1000;
      return { input: { text: typingNorm(text), elapsedMs: Math.round(elapsed) }, value: sec, error: sec, elapsedMs: elapsed, extra: { timeSec: sec, pct: 100 }, provisional: false };
    }
    // ★ 진행 글(임시) — 0% (빈칸 · 첫 글자부터 틀림)도 받는다(거부하면 화면에 오류 알림이 뜬다 · R051 그림에서 찾음). 0% 는 값 없음 = 미제출과 같은 꼴찌
    const pct = typingProgress(target, text) * 100;
    return {
      input: { text: typingNorm(text) },
      value: pct > 0 ? TYPING_UNFINISHED_BASE + (100 - pct) : null,
      error: null,
      elapsedMs: null,
      submitted: false,
      extra: { unfinished: true, pct: Math.round(pct * 10) / 10 },
      provisional: true,
    };
  },
};

// 완벽한 원 — 점 배열 [x, y, t] 만 받는다 · 점수는 서버가 다시 계산(클라이언트가 보낸 점수 칸은 보지 않는다)
const circle: MinigameDef = {
  key: 'circle',
  info: minigameInfo('circle'),
  buildRounds(seed) {
    return [0, 1, 2].map((i) => ({ itemKey: `circle-${i + 1}`, params: { playMs: CIRCLE_PLAY_MS }, playMs: CIRCLE_PLAY_MS, seed: seed + i }));
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const pts = obj?.points;
    if (circlePointsProblem(pts, spec.playMs) !== null) return null;
    const arr = pts as [number, number, number][];
    const lastT = arr[arr.length - 1]![2];
    if (lastT > ctx.serverElapsedMs + CAKE_EARLY_TOLERANCE_MS) return null;
    const xy = arr.map(([x, y]) => ({ x, y }));
    const fit = circleScore(xy);
    const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
    return {
      input: { points: arr.map(([x, y, t]) => [r4(x), r4(y), Math.round(t)]) },
      value: fit.score,
      error: fit.dev,
      elapsedMs: lastT,
      extra: { stroke: circleThumb(xy), cx: r4(fit.cx), cy: r4(fit.cy), r: r4(fit.r), coverageDeg: Math.round(fit.coverageDeg), flaw: fit.flaw },
      provisional: false,
    };
  },
};

// 각도 맞추기 — 지금 각(임시) · 확정 · 마감 때 마지막 각
const angle: MinigameDef = {
  key: 'angle',
  info: minigameInfo('angle'),
  buildRounds(seed) {
    return angleTargets(seed).map((t, i) => ({ itemKey: `angle-${t}`, params: { target: t }, playMs: ANGLE_PLAY_MS, seed: seed + i }));
  },
  privateFor(spec, accountId, roundIndex) {
    return { start: angleStart(spec.seed, accountId, roundIndex, Number(spec.params.target)) };
  },
  parseInput(raw, spec) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const deg = num(obj?.deg);
    if (deg === null || deg < 0 || deg > 180) return null;
    const target = Number(spec.params.target);
    const d = Math.round(clampAngle(deg) * 1000) / 1000;
    return {
      input: { deg: d },
      value: angleError(d, target),
      error: d - target,
      elapsedMs: num(obj?.elapsedMs),
      extra: { deg: d, target },
      provisional: obj?.final !== true,
    };
  },
};

export const MINIGAME_DEFS: Record<MinigameKey, MinigameDef> = { cake, balance, reaction, typing, circle, angle };
