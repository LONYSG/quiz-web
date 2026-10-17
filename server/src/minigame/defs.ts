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
  QUIZ_DUMMY,
  QUIZ_MINIGAME_KEYS,
  QUIZ_PRACTICE_ITEMS,
  QUIZ_SPEC,
  PHOTO_REVEAL_MS,
  countryLabel,
  normalizeAnswer,
  pctOff,
  pickQuizItems,
  priceFresh,
  ratioError,
  type QuizMinigameKey,
  MINORITY_PLAY_MS,
  ODDONE_PENALTY_MS,
  ODDONE_PLAY_MS,
  GAUGE_HIDE_PCT,
  GAUGE_PLAY_MS,
  TWOTHIRDS_PLAY_MS,
  gaugeOffPct,
  gaugePos,
  gaugeRounds,
  minorityResult,
  oddoneRounds,
  twoThirdsTarget,
} from '@quiz/shared';
import type { QuizData, QuizItem } from '../db/minigameItems.js';

export interface RoundSpec {
  /** 항목 · 패턴 키 (기록 · 퀴즈류의 경험 기록에 쓴다 — 퀴즈류는 문항 id) */
  itemKey: string;
  /** ★ R052 — 퀴즈류 문항 id (minigame_rounds.item_id) */
  itemId?: string;
  /** 모두에게 공개하는 판 설정 (화면이 그린다) */
  params: Record<string, unknown>;
  /** ★ R052 — 정답 공개(roundResult) 때만 화면에 보내는 것 (가격 · 정답 · 값 · 표) */
  reveal?: Record<string, unknown>;
  /** ★ R052 — 서버만 아는 것(정답). 화면에 보내지 않는다 */
  secret?: Record<string, unknown>;
  /** ★ R052 — 이 문항을 이미 본 참가자(점수 0 · "이미 본 문항") */
  experiencedBy?: string[];
  /** ★ R052 — 준비 · 결과 단계 길이(없으면 공통 1.5초 · 4초) */
  readyMs?: number;
  resultMs?: number;
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
  /** ★ R052 — 입력한 사람에게만 바로 알려 줄 것(사진 — 맞음/틀림) */
  feedback?: Record<string, unknown>;
}

/** ★ R052 — 판 만들기에 필요한 것 (퀴즈류는 문항 · 경험이 있어야 한다) */
export interface BuildCtx {
  practice: boolean;
  /** 참가자 계정 */
  participants: string[];
  /** 게임에 올려 둔 퀴즈류 문항 · 경험(연습 · 미니게임 포함이 꺼진 게임이면 null) */
  quiz: { data: QuizData; experienced: Map<string, Set<string>> } | null;
  now: number;
}

export interface MinigameDef {
  key: MinigameKey;
  info: MinigameInfo;
  /** 판 구성 (시드로 — 같은 시드면 같은 판). ★ R052: null = 이 미니게임을 지금 낼 수 없다(퀴즈류 문항 모자람) → 엔진이 다른 것을 고른다 */
  buildRounds(seed: number, ctx: BuildCtx): RoundSpec[] | null;
  /** 사람마다 다른 공개 값 (균형 = 시작 점). 없으면 null */
  privateFor?(spec: RoundSpec, accountId: string, roundIndex: number): Record<string, unknown> | null;
  /**
   * ★ R053 — 판 끝 정산(모두의 입력을 봐야 값이 정해질 때 — 소수파 · 평균의 2/3). 계정 → 값 · 덧붙임, 공개 값.
   */
  finalizeRound?(spec: RoundSpec, subs: ReadonlyMap<string, ParsedInput & { provisional: boolean }>): {
    values: Map<string, { value: number | null; error?: number | null; extra?: Record<string, unknown> }>;
    reveal?: Record<string, unknown>;
  };
  /**
   * ★ 입력 검사 · 판정 값 계산 (서버). 이상한 값이면 null(받지 않음).
   *   provisional = true 면 "아직 확정 아님"(균형 — 움직이는 동안 보내는 값 · 마감 때 마지막 것을 쓴다)
   */
  parseInput(raw: unknown, spec: RoundSpec, ctx: { serverElapsedMs: number; prev?: ParsedInput & { provisional: boolean } }): (ParsedInput & { provisional: boolean }) | null;
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
  buildRounds(seed, _ctx) {
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
  buildRounds(seed, _ctx) {
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
  buildRounds(seed, _ctx) {
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
  buildRounds(seed, _ctx) {
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
  buildRounds(seed, _ctx) {
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
  buildRounds(seed, _ctx) {
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

export const MINIGAME_DEFS_PHYSICAL = { cake, balance, reaction, typing, circle, angle };

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ R052 — 퀴즈류 다섯 (얼마게요 · 빅맥지수 · 사진 이름 맞히기 · 얼마나 될까 · 어느 쪽?)
//   문항 = 판 하나. 선정은 pickQuizItems(01 12장 3단계 · 모두 본 문항 제외 · 모자라면 null → 건너뜀).
//   정답은 secret(서버만) · 공개 때 reveal. 연습은 더미(QUIZ_DUMMY — DB 를 보지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
export function isQuizMinigameKey(k: string): k is QuizMinigameKey {
  return (QUIZ_MINIGAME_KEYS as readonly string[]).includes(k);
}

/** 문항 고르기 — 적재본에서 3단계 선정 */
function pickFor(key: QuizMinigameKey, seed: number, ctx: BuildCtx, filter: (it: QuizItem) => boolean = () => true) {
  if (!ctx.quiz) return null;
  const exp = ctx.quiz.experienced;
  const pool = ctx.quiz.data.items[key].filter(filter);
  return pickQuizItems(pool, ctx.participants, (a, id) => exp.get(a)?.has(`${key}|${id}`) ?? false, QUIZ_SPEC[key].items, seed);
}

function quizSpec(key: QuizMinigameKey, i: number, seed: number, base: Omit<RoundSpec, 'playMs' | 'seed' | 'readyMs' | 'resultMs'>): RoundSpec {
  const q = QUIZ_SPEC[key];
  return { ...base, playMs: q.playMs, seed: seed + i, readyMs: q.readyMs, resultMs: q.revealMs };
}

/** 숫자 맞히기(얼마게요 · 빅맥 · 얼마나) 입력 — { value, elapsedMs } · 한 번만 */
function parseNumber(raw: unknown, spec: RoundSpec): (ParsedInput & { provisional: boolean }) | null {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const v = num(obj?.value);
  if (v === null || !(v > 0) || v > 1e15) return null;
  const answer = Number(spec.secret?.answer);
  const err = ratioError(v, answer);
  if (!Number.isFinite(err)) return null;
  return {
    input: { value: v, elapsedMs: num(obj?.elapsedMs) },
    value: err,
    error: pctOff(v, answer),
    elapsedMs: num(obj?.elapsedMs),
    extra: { guess: v, pct: Math.round(pctOff(v, answer) * 100) / 100 },
    provisional: false,
  };
}

const price: MinigameDef = {
  key: 'price',
  info: minigameInfo('price'),
  buildRounds(seed, ctx) {
    if (ctx.practice) {
      return QUIZ_DUMMY.price.slice(0, QUIZ_PRACTICE_ITEMS).map((d, i) =>
        quizSpec('price', i, seed, { itemKey: d.id, params: { name: d.name, brand: d.brand, category: d.category, imageId: null, dummy: true }, reveal: { priceKrw: d.priceKrw, note: d.note }, secret: { answer: d.priceKrw } }),
      );
    }
    const pick = pickFor('price', seed, ctx, (it) => priceFresh(String(it.payload.priceAsOf), ctx.now));
    if (!pick) return null;
    return pick.items.map((it, i) => {
      const p = it.payload;
      return quizSpec('price', i, seed, {
        itemKey: it.id,
        itemId: it.id,
        params: { name: p.name, brand: p.brand, category: p.category, imageId: it.imageIds[0] ?? null },
        reveal: { priceKrw: p.priceKrw, note: p.note, priceAsOf: p.priceAsOf, attribution: it.attribution },
        secret: { answer: p.priceKrw },
        experiencedBy: pick.experiencedBy.get(it.id),
      });
    });
  },
  parseInput: (raw, spec) => parseNumber(raw, spec),
};

type WpRow = { cc: string; countryKo: string; localPrice: number; currency: string; krw: number };
const worldprice: MinigameDef = {
  key: 'worldprice',
  info: minigameInfo('worldprice'),
  buildRounds(seed, ctx) {
    const make = (
      i: number,
      id: string,
      prod: { nameKo?: unknown; unit?: unknown; rows: readonly WpRow[]; fxAsOf?: unknown; asOf?: unknown },
      imageId: string | null,
      targetCc: string,
      shownCc: readonly string[],
      real: boolean,
    ): RoundSpec => {
      const rows = prod.rows.map((r) => ({ cc: r.cc, countryKo: countryLabel(r.cc, r.countryKo), localPrice: r.localPrice, currency: r.currency, krw: r.krw }));
      const target = rows.find((r) => r.cc === targetCc)!;
      const shown = shownCc.map((c) => rows.find((r) => r.cc === c)).filter(Boolean);
      const sorted = [...rows].sort((a, b) => a.krw - b.krw);
      return quizSpec('worldprice', i, seed, {
        itemKey: id,
        itemId: real ? id : undefined,
        params: { nameKo: prod.nameKo, unit: prod.unit, imageId, target: { cc: target.cc, countryKo: target.countryKo }, shown, fxAsOf: prod.fxAsOf, dummy: !real },
        reveal: { targetKrw: target.krw, targetLocal: target.localPrice, currency: target.currency, rows: sorted, fxAsOf: prod.fxAsOf, asOf: prod.asOf ?? null },
        secret: { answer: target.krw },
      });
    };
    if (ctx.practice) {
      const d = QUIZ_DUMMY.worldprice[0]!;
      const plan: [string, string[]][] = [
        [d.targetCc, [...d.shownCc]],
        ['XD', ['KR', 'XA', 'XB']],
        ['XC', ['KR', 'XA', 'XD']],
      ];
      return plan.slice(0, QUIZ_PRACTICE_ITEMS).map(([t, shownCc], i) => make(i, `${d.id}-${i + 1}`, d, null, t, shownCc, false));
    }
    const prods = ctx.quiz?.data.products;
    if (!prods) return null;
    const pick = pickFor('worldprice', seed, ctx, (it) => prods.has(String(it.payload.productId)) && it.payload.targetCc !== 'EU');
    if (!pick) return null;
    return pick.items.map((it, i) => {
      const pr = prods.get(String(it.payload.productId))!;
      const sp = make(i, it.id, pr.payload, pr.imageId, String(it.payload.targetCc), it.payload.shownCc as string[], true);
      return { ...sp, experiencedBy: pick.experiencedBy.get(it.id) };
    });
  },
  parseInput: (raw, spec) => parseNumber(raw, spec),
};

const DUMMY_SHAPE: Record<string, string> = { 'dummy-photo-1': 'circle', 'dummy-photo-2': 'triangle', 'dummy-photo-3': 'square' };
const answersOf = (a: string, alt: readonly string[]) => [...new Set([a, ...alt].map((x) => normalizeAnswer(x)).filter(Boolean))];
const photo: MinigameDef = {
  key: 'photo',
  info: minigameInfo('photo'),
  buildRounds(seed, ctx) {
    if (ctx.practice) {
      return QUIZ_DUMMY.photo.slice(0, QUIZ_PRACTICE_ITEMS).map((d, i) =>
        quizSpec('photo', i, seed, {
          itemKey: d.id,
          params: { imageId: null, dummyShape: DUMMY_SHAPE[d.id], revealMode: d.revealMode, revealMs: PHOTO_REVEAL_MS, dummy: true },
          reveal: { answer: d.answer, explanation: d.explanation, attribution: null },
          secret: { answers: answersOf(d.answer, d.altAnswers) },
        }),
      );
    }
    const pick = pickFor('photo', seed, ctx);
    if (!pick) return null;
    return pick.items.map((it, i) => {
      const p = it.payload;
      return quizSpec('photo', i, seed, {
        itemKey: it.id,
        itemId: it.id,
        params: { imageId: it.imageIds[0] ?? null, revealMode: p.revealMode, category: p.category, revealMs: PHOTO_REVEAL_MS },
        reveal: { answer: p.answer, explanation: p.explanation, attribution: it.attribution },
        secret: { answers: answersOf(String(p.answer), (p.altAnswers as string[]) ?? []) },
        experiencedBy: pick.experiencedBy.get(it.id),
      });
    });
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const text = typeof obj?.text === 'string' ? obj.text.slice(0, 60) : null;
    if (text === null || !text.trim()) return null;
    const elapsed = deviceElapsed(obj, spec, ctx);
    if (elapsed === null) return null;
    const tries = Number(ctx.prev?.extra?.tries ?? 0) + 1;
    const ok = ((spec.secret?.answers as string[]) ?? []).includes(normalizeAnswer(text));
    if (ok) {
      return {
        input: { text, elapsedMs: Math.round(elapsed), tries },
        value: Math.round(elapsed),
        error: null,
        elapsedMs: elapsed,
        extra: { timeSec: Math.round(elapsed / 100) / 10, tries },
        provisional: false,
        feedback: { correct: true, timeMs: Math.round(elapsed) },
      };
    }
    // 틀림 — 다시 칠 수 있다(임시 기록 · 시도 수만 쌓는다)
    return { input: { lastWrong: text, tries }, value: null, error: null, elapsedMs: null, submitted: false, extra: { tries }, provisional: true, feedback: { correct: false, text } };
  },
};

const estimate: MinigameDef = {
  key: 'estimate',
  info: minigameInfo('estimate'),
  buildRounds(seed, ctx) {
    if (ctx.practice) {
      return QUIZ_DUMMY.estimate.slice(0, QUIZ_PRACTICE_ITEMS).map((d, i) =>
        quizSpec('estimate', i, seed, {
          itemKey: d.id,
          params: { question: d.question, unit: d.unit, kind: 'other', imageId: null, displayDecimals: d.displayDecimals, dummy: true },
          reveal: { value: d.value, unit: d.unit, displayDecimals: d.displayDecimals, note: d.note, explanation: d.explanation, attribution: null },
          secret: { answer: d.value },
        }),
      );
    }
    const pick = pickFor('estimate', seed, ctx);
    if (!pick) return null;
    return pick.items.map((it, i) => {
      const p = it.payload;
      return quizSpec('estimate', i, seed, {
        itemKey: it.id,
        itemId: it.id,
        params: { question: p.question, unit: p.unit, kind: p.kind, imageId: it.imageIds[0] ?? null, displayDecimals: p.displayDecimals },
        reveal: { value: p.value, unit: p.unit, displayDecimals: p.displayDecimals, note: p.note ?? null, explanation: p.explanation, attribution: it.attribution },
        secret: { answer: p.value },
        experiencedBy: pick.experiencedBy.get(it.id),
      });
    });
  },
  parseInput: (raw, spec) => parseNumber(raw, spec),
};

const which: MinigameDef = {
  key: 'which',
  info: minigameInfo('which'),
  buildRounds(seed, ctx) {
    if (ctx.practice) {
      return QUIZ_DUMMY.which.slice(0, QUIZ_PRACTICE_ITEMS).map((d, i) =>
        quizSpec('which', i, seed, {
          itemKey: d.id,
          params: { stem: d.stem, kind: d.kind, unit: d.unit, a: { label: d.a.label, imageId: null }, b: { label: d.b.label, imageId: null }, dummy: true },
          reveal: { answer: d.answer, a: d.a.value, b: d.b.value, unit: d.unit, margin: null },
          secret: { answer: d.answer },
        }),
      );
    }
    const pick = pickFor('which', seed, ctx);
    if (!pick) return null;
    return pick.items.map((it, i) => {
      const p = it.payload as Record<string, unknown> & { a: { label: string; value: number }; b: { label: string; value: number } };
      const imgA = it.imageIds.find((x) => x.endsWith('-a')) ?? null;
      const imgB = it.imageIds.find((x) => x.endsWith('-b')) ?? null;
      return quizSpec('which', i, seed, {
        itemKey: it.id,
        itemId: it.id,
        params: { stem: p.stem, kind: p.kind, unit: p.unit, a: { label: p.a.label, imageId: imgA }, b: { label: p.b.label, imageId: imgB } },
        reveal: { answer: p.answer, a: p.a.value, b: p.b.value, unit: p.unit, margin: p.margin, note: p.note ?? null, attribution: it.attribution },
        secret: { answer: p.answer },
        experiencedBy: pick.experiencedBy.get(it.id),
      });
    });
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const choice = obj?.choice;
    if (choice !== 'a' && choice !== 'b') return null;
    const elapsed = deviceElapsed(obj, spec, ctx);
    if (elapsed === null) return null;
    const correct = choice === spec.secret?.answer;
    return { input: { choice, elapsedMs: Math.round(elapsed) }, value: correct ? Math.round(elapsed) : null, error: null, elapsedMs: elapsed, extra: { choice, correct }, provisional: false };
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// ★★★ R053 — 미니게임 3차 (소수파 · 평균의 2/3 · 다른 하나 찾기 · 게이지)
// ─────────────────────────────────────────────────────────────────────────────

// 소수파 — 1~5 · 8초 동안 바꿀 수 있다(임시) · 마감 때 마지막 선택 · 판 끝 정산: 가장 적게 고른 수(0명 제외)를 고른 사람 = 1(이김)
const minority: MinigameDef = {
  key: 'minority',
  info: minigameInfo('minority'),
  buildRounds(seed) {
    return [0, 1, 2, 3, 4].map((i) => ({ itemKey: `minority-${i + 1}`, params: { choices: [1, 2, 3, 4, 5] }, playMs: MINORITY_PLAY_MS, seed: seed + i }));
  },
  parseInput(raw) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const pick = num(obj?.pick);
    if (pick === null || !Number.isInteger(pick) || pick < 1 || pick > 5) return null;
    return { input: { pick }, value: null, error: null, elapsedMs: num(obj?.elapsedMs), extra: { pick }, provisional: true };
  },
  finalizeRound(_spec, subs) {
    const picks = [...subs.entries()].map(([a, s]) => [a, Number(s.extra?.pick)] as const);
    const r = minorityResult(picks.map(([, p]) => p));
    const values = new Map(picks.map(([a, p]) => [a, { value: r.minority.includes(p) ? 1 : null, extra: { pick: p, win: r.minority.includes(p) } }]));
    return { values, reveal: { counts: r.counts, minority: r.minority } };
  },
};

// 평균의 2/3 — 0~100 정수 한 번 · 판 끝 정산: 목표 = 평균 × 2/3(낸 사람만) · 값 = |입력 − 목표|
const twothirds: MinigameDef = {
  key: 'twothirds',
  info: minigameInfo('twothirds'),
  buildRounds(seed) {
    return [0, 1, 2].map((i) => ({ itemKey: `twothirds-${i + 1}`, params: { min: 0, max: 100 }, playMs: TWOTHIRDS_PLAY_MS, seed: seed + i }));
  },
  parseInput(raw) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const v = num(obj?.value);
    if (v === null || !Number.isInteger(v) || v < 0 || v > 100) return null;
    return { input: { value: v }, value: 0, error: null, elapsedMs: num(obj?.elapsedMs), extra: { pick: v }, provisional: false };
  },
  finalizeRound(_spec, subs) {
    const picks = [...subs.entries()].map(([a, s]) => [a, Number(s.extra?.pick)] as const);
    const t = twoThirdsTarget(picks.map(([, p]) => p));
    const values = new Map(picks.map(([a, p]) => [a, { value: t ? Math.abs(p - t.target) : null, error: t ? p - t.target : null, extra: { pick: p, target: t?.target ?? null } }]));
    return { values, reveal: t ? { mean: t.mean, target: t.target, n: picks.length } : { mean: null, target: null, n: 0 } };
  },
};

// 다른 하나 찾기 — 격자는 서버 시드 · 누른 칸 + 기기 ms · 틀리면 +2초 벌점(임시 · 계속) · 맞으면 확정(값 = ms + 벌점)
const oddone: MinigameDef = {
  key: 'oddone',
  info: minigameInfo('oddone'),
  buildRounds(seed) {
    return oddoneRounds(seed).map((r, i) => ({
      itemKey: `oddone-${r.size}-${r.pair.base}-${r.pair.odd}`,
      params: { size: r.size, base: r.pair.base, odd: r.pair.odd, oddIndex: r.oddIndex, penaltyMs: ODDONE_PENALTY_MS },
      secret: { oddIndex: r.oddIndex },
      playMs: ODDONE_PLAY_MS,
      seed: seed + i,
    }));
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const index = num(obj?.index);
    const size = Number(spec.params.size);
    if (index === null || !Number.isInteger(index) || index < 0 || index >= size * size) return null;
    const elapsed = deviceElapsed(obj, spec, ctx);
    if (elapsed === null) return null;
    const wrong = Number(ctx.prev?.extra?.wrong ?? 0);
    if (index === Number(spec.secret?.oddIndex)) {
      const ms = Math.round(elapsed + wrong * ODDONE_PENALTY_MS);
      return { input: { index, elapsedMs: Math.round(elapsed), wrong }, value: ms, error: null, elapsedMs: elapsed, extra: { wrong, timeMs: ms }, provisional: false, feedback: { correct: true, timeMs: ms } };
    }
    return { input: { lastWrong: index, wrong: wrong + 1 }, value: null, error: null, elapsedMs: null, submitted: false, extra: { wrong: wrong + 1 }, provisional: true, feedback: { correct: false, index, wrong: wrong + 1 } };
  },
};

// 게이지 — 누른 순간(판 시작부터 기기 ms) 하나 · 서버가 위치를 다시 계산(클라이언트 위치 값은 보지 않는다)
const gauge: MinigameDef = {
  key: 'gauge',
  info: minigameInfo('gauge'),
  buildRounds(seed) {
    return gaugeRounds(seed).map((r, i) => ({
      itemKey: `gauge-${r.periodMs}${r.hidden ? '-hidden' : ''}`,
      params: { periodMs: r.periodMs, phase0: r.phase0, hidden: r.hidden, hidePct: GAUGE_HIDE_PCT },
      playMs: GAUGE_PLAY_MS,
      seed: seed + i,
    }));
  },
  parseInput(raw, spec, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const elapsed = deviceElapsed(obj, spec, ctx);
    if (elapsed === null) return null;
    const pos = gaugePos({ periodMs: Number(spec.params.periodMs), phase0: Number(spec.params.phase0) }, elapsed);
    const off = gaugeOffPct(pos);
    return { input: { elapsedMs: Math.round(elapsed * 10) / 10 }, value: off, error: (pos - 0.5) * 200, elapsedMs: elapsed, extra: { pos: Math.round(pos * 10000) / 10000 }, provisional: false };
  },
};

export const MINIGAME_DEFS: Record<MinigameKey, MinigameDef> = { ...MINIGAME_DEFS_PHYSICAL, price, worldprice, photo, estimate, which, minority, twothirds, oddone, gauge };
