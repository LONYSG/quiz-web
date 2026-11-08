// =============================================================================
// ★★★ R081 — 미니게임 2차 (D-330 ⑹ ⑽ · D-338): 순서대로(order) · 빙고(bingo) — 주제 세트 위(D-337 꼴)
//
// ★ 순서대로: 3판 · 판마다 세트 하나(연도 있는 closed · ORDER_EXCLUDE 아님) · 서로 다른 연도 5장(이름만 · 섞어서) ·
//   20초 동안 차례로 누른다(바꿀 수 있음 — 마지막 상태 · 5장 다 눌러야 낸 것) · 점수 = 10쌍 중 앞뒤가 맞은 쌍 → 판 순위 점수 · 3판 합.
// ★ 빙고: 1 채우기 판(30초 · 많이 말하기 꼴 입력 → 다음 빈 칸 · 본인에게만) + 호명 판 최대 12(8초 · 동시 · 자기 판의 안 불린 칸 하나 ·
//   안 누르면 서버가 대신) · 호명된 항목은 모든 판에서 칠함 · 2줄 = 빙고(순위 확정 · 호명에서 빠짐) · 한 명 빼고 전원 빙고 또는 12회면 끝.
//   점수는 끝난 판에서만 — 값 = 빙고 순(빠를수록) → 미완성은 줄 수 → 칠한 칸 수(같으면 공동) → 판 순위 점수.
//   판 사이 상태(판 · 칠함 · 호명 기록)는 모든 판 spec 이 같은 객체를 가리킨다(secret.state — 화면에 안 보냄).
// =============================================================================

import {
  BINGO_CALL_MS,
  BINGO_CALL_REVEAL_MS,
  BINGO_CALL_ROUNDS,
  BINGO_FILL_MS,
  BINGO_FILL_REVEAL_MS,
  BINGO_LINES_TO_WIN,
  BINGO_SIZE,
  ORDER_BASIS,
  ORDER_CARDS,
  ORDER_DUMMY,
  ORDER_PLAY_MS,
  ORDER_REVEAL_MS,
  ORDER_ROUNDS,
  TOPIC_DUMMY,
  TOPIC_TEXT_MAX,
  bingoLineCount,
  matchTopic,
  minigameInfo,
  orderPairs,
  seededRandom,
} from '@quiz/shared';
import { makeTopicSet, type TopicSet } from '../db/topics.js';
import type { MinigameDef, RoundSpec } from './defs.js';
import { topicsFor } from './topicGames.js';

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
const objOf = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null);
const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};

// ─────────────────────────────────────────────────────────────────────────────
// 순서대로
// ─────────────────────────────────────────────────────────────────────────────
/** 서로 다른 연도 n 장 — 없으면 null */
export function pickOrderCards(set: Pick<TopicSet, 'items'>, n: number, rnd: () => number): { id: string; label: string; year: number }[] | null {
  const withYear = shuffle(set.items.filter((x) => x.year !== null) as { id: string; label: string; year: number }[], rnd);
  const out: { id: string; label: string; year: number }[] = [];
  const years = new Set<number>();
  for (const it of withYear) {
    if (years.has(it.year)) continue;
    years.add(it.year);
    out.push({ id: it.id, label: it.label, year: it.year });
    if (out.length >= n) break;
  }
  return out.length >= n ? out : null;
}

export const order: MinigameDef = {
  key: 'order',
  info: minigameInfo('order'),
  buildRounds(seed, ctx) {
    const sets = ctx.practice
      ? ORDER_DUMMY.map((d) => makeTopicSet({ topic: d.topic, nameKo: d.nameKo, kind: 'closed' }, d.items.map((x) => ({ id: x.id, name: x.name, year: x.year ?? null }))))
      : topicsFor(ORDER_ROUNDS, seed, ctx, 'order');
    if (!sets || sets.length < ORDER_ROUNDS) return null;
    const rnd = seededRandom((seed ^ 0x0dde5) >>> 0);
    const rounds: RoundSpec[] = [];
    for (const [i, s] of sets.slice(0, ORDER_ROUNDS).entries()) {
      const cards = pickOrderCards(s, ORDER_CARDS, rnd);
      if (!cards) return null;
      const shown = shuffle([...cards], rnd);
      const answer = [...cards].sort((a, b) => a.year - b.year);
      rounds.push({
        itemKey: `topic:${s.topic}`,
        params: { topic: s.topic, nameKo: s.nameKo, basis: ORDER_BASIS[s.topic] ?? '연도', cards: shown.map((c) => ({ id: c.id, label: c.label })), ...(ctx.practice ? { dummy: true } : {}) },
        reveal: { answer: answer.map((c) => ({ id: c.id, label: c.label, year: c.year })) },
        secret: { years: Object.fromEntries(cards.map((c) => [c.id, c.year])) },
        playMs: ORDER_PLAY_MS,
        readyMs: 1_500,
        resultMs: ORDER_REVEAL_MS,
        seed: seed + i,
      });
    }
    return rounds;
  },
  countProvisional: true,
  parseInput(raw, spec) {
    const o = objOf(raw)?.order;
    if (!Array.isArray(o) || o.length > ORDER_CARDS) return null;
    const years = (spec.secret?.years ?? {}) as Record<string, number>;
    const ids = o.filter((x): x is string => typeof x === 'string');
    if (ids.length !== o.length || new Set(ids).size !== ids.length || ids.some((x) => !(x in years))) return null;
    const done = ids.length === ORDER_CARDS;
    const pairs = done ? orderPairs(ids, (id) => years[id]!) : null;
    return { input: { order: ids }, value: pairs, error: null, elapsedMs: null, submitted: done, extra: { order: ids, pairs }, provisional: true };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 빙고
// ─────────────────────────────────────────────────────────────────────────────
export interface BingoCall {
  round: number;
  accountId: string;
  itemId: string;
  label: string;
  auto: boolean;
  /** 이 항목이 있던 판 수(부른 사람 포함) */
  onBoards: number;
}
export interface BingoState {
  topic: string;
  items: { id: string; label: string }[];
  labelOf: Map<string, string>;
  matcher: Map<string, string>;
  participants: string[];
  boards: Map<string, (string | null)[]>;
  manual: Map<string, number>;
  marked: Set<string>;
  calls: BingoCall[];
  bingoAt: Map<string, number>;
  over: boolean;
  seed: number;
}
const CELLS = BINGO_SIZE * BINGO_SIZE;
const stateOf = (spec: RoundSpec) => (spec.secret as { state: BingoState }).state;
const boardOf = (st: BingoState, a: string) => {
  let b = st.boards.get(a);
  if (!b) st.boards.set(a, (b = Array.from({ length: CELLS }, () => null)));
  return b;
};
const markedOf = (st: BingoState, b: readonly (string | null)[]) => b.map((id) => id !== null && st.marked.has(id));
const linesOf = (st: BingoState, a: string) => bingoLineCount(markedOf(st, boardOf(st, a)));

/** 빈 칸 자동 채움(세트의 남은 항목 무작위 · 판 안 겹침) */
export function autoFill(st: BingoState): void {
  for (const a of st.participants) {
    const b = boardOf(st, a);
    const have = new Set(b.filter((x): x is string => x !== null));
    const rnd = seededRandom((st.seed ^ hash(a)) >>> 0);
    const rest = shuffle(st.items.map((x) => x.id).filter((id) => !have.has(id)), rnd);
    for (let i = 0; i < b.length; i += 1) if (b[i] === null) b[i] = rest.shift() ?? null;
  }
}

/** 판 결과 값 — 빙고 순(빠를수록 큼) → 줄 수 → 칠한 칸 수 */
export function bingoValue(st: BingoState, a: string): number {
  const at = st.bingoAt.get(a);
  if (at !== undefined) return 10_000 - at * 100;
  return linesOf(st, a) * 20 + markedOf(st, boardOf(st, a)).filter(Boolean).length;
}

/** 호명 한 판 정산 — 부른 것(안 부른 사람은 자동) · 칠함 · 새 빙고 · 끝났나 */
export function bingoCallRound(st: BingoState, round: number, picks: ReadonlyMap<string, string | null>): { calls: BingoCall[]; newBingo: string[] } {
  const calls: BingoCall[] = [];
  for (const a of st.participants) {
    if (st.bingoAt.has(a)) continue;
    const b = boardOf(st, a);
    let id = picks.get(a) ?? null;
    let auto = false;
    if (!id || st.marked.has(id) || !b.includes(id)) {
      const open = b.filter((x): x is string => x !== null && !st.marked.has(x));
      if (open.length === 0) continue;
      id = open[Math.floor(seededRandom((st.seed ^ hash(`${a}:${round}`)) >>> 0)() * open.length)]!;
      auto = true;
    }
    calls.push({ round, accountId: a, itemId: id, label: st.labelOf.get(id) ?? id, auto, onBoards: 0 });
  }
  for (const c of calls) st.marked.add(c.itemId);
  for (const c of calls) c.onBoards = st.participants.filter((a) => boardOf(st, a).includes(c.itemId)).length;
  st.calls.push(...calls);
  const newBingo: string[] = [];
  for (const a of st.participants) {
    if (st.bingoAt.has(a)) continue;
    if (linesOf(st, a) >= BINGO_LINES_TO_WIN) {
      st.bingoAt.set(a, round);
      newBingo.push(a);
    }
  }
  const left = st.participants.filter((a) => !st.bingoAt.has(a)).length;
  st.over = round >= BINGO_CALL_ROUNDS || left === 0 || (st.participants.length >= 2 && left <= 1);
  return { calls, newBingo };
}

export const bingo: MinigameDef = {
  key: 'bingo',
  info: minigameInfo('bingo'),
  buildRounds(seed, ctx) {
    let set: TopicSet | null;
    if (ctx.practice) {
      const d = TOPIC_DUMMY[0]!;
      set = makeTopicSet({ topic: d.topic, nameKo: d.nameKo, kind: 'closed' }, d.items.map((x) => ({ id: x.id, name: x.name, variants: [...(x.variants ?? [])] })));
    } else set = topicsFor(1, seed, ctx, 'bingo')?.[0] ?? null;
    if (!set) return null;
    const st: BingoState = {
      topic: set.topic,
      items: set.items.map((x) => ({ id: x.id, label: x.label })),
      labelOf: new Map(set.items.map((x) => [x.id, x.label])),
      matcher: set.matcher,
      participants: [...ctx.participants],
      boards: new Map(),
      manual: new Map(),
      marked: new Set(),
      calls: [],
      bingoAt: new Map(),
      over: false,
      seed,
    };
    const base = { topic: set.topic, nameKo: set.nameKo, size: BINGO_SIZE, toWin: BINGO_LINES_TO_WIN, ...(ctx.practice ? { dummy: true } : {}) };
    const secret = { state: st } as unknown as Record<string, unknown>;
    const rounds: RoundSpec[] = [
      { itemKey: `topic:${set.topic}`, params: { ...base, phase: 'fill' }, secret, playMs: BINGO_FILL_MS, readyMs: 1_500, resultMs: BINGO_FILL_REVEAL_MS, seed },
    ];
    for (let r = 1; r <= BINGO_CALL_ROUNDS; r += 1) {
      rounds.push({ itemKey: `topic:${set.topic}`, params: { ...base, phase: 'call', call: r, calls: BINGO_CALL_ROUNDS }, secret, playMs: BINGO_CALL_MS, readyMs: 300, resultMs: BINGO_CALL_REVEAL_MS, seed: seed + r });
    }
    return rounds;
  },
  privateFor(spec, accountId) {
    const st = stateOf(spec);
    if (!st.participants.includes(accountId)) return null;
    const b = boardOf(st, accountId);
    return {
      board: b.map((id) => (id ? { id, label: st.labelOf.get(id) ?? id, marked: st.marked.has(id) } : null)),
      manual: st.manual.get(accountId) ?? 0,
      lines: linesOf(st, accountId),
      bingoAt: st.bingoAt.get(accountId) ?? null,
      bingos: st.participants.filter((a) => st.bingoAt.has(a)).length,
      history: st.calls.slice(-24).map((c) => ({ round: c.round, accountId: c.accountId, label: c.label, auto: c.auto, onBoards: c.onBoards, mine: boardOf(st, accountId).includes(c.itemId) })),
    };
  },
  skipWait(spec, accountId) {
    return spec.params.phase === 'call' && stateOf(spec).bingoAt.has(accountId);
  },
  isOver(spec) {
    return spec.params.phase === 'call' && stateOf(spec).over;
  },
  parseInput(raw, spec, ctx) {
    const st = stateOf(spec);
    const a = ctx.accountId ?? '';
    if (!st.participants.includes(a)) return null;
    const obj = objOf(raw);
    if (spec.params.phase === 'fill') {
      const t = typeof obj?.text === 'string' ? [...obj.text.trim()].slice(0, TOPIC_TEXT_MAX).join('') : '';
      if (!t) return null;
      const b = boardOf(st, a);
      const id = matchTopic(st.matcher, t);
      const label = id ? (st.labelOf.get(id) ?? t) : null;
      let feedback: Record<string, unknown>;
      if (!id) feedback = { result: 'wrong', text: t };
      else if (b.includes(id)) feedback = { result: 'dup', label, text: t };
      else {
        const cell = b.indexOf(null);
        if (cell < 0) feedback = { result: 'full', label, text: t };
        else {
          b[cell] = id;
          st.manual.set(a, (st.manual.get(a) ?? 0) + 1);
          feedback = { result: 'ok', label, text: t, cell };
        }
      }
      const filled = b.filter((x) => x !== null).length;
      return { input: { last: t }, value: null, error: null, elapsedMs: null, submitted: false, extra: { filled }, provisional: true, feedback: { ...feedback, filled } };
    }
    // 호명 — 자기 판의 안 불린 칸 하나 · 한 번만
    if (st.bingoAt.has(a)) return null;
    const cell = typeof obj?.cell === 'number' && Number.isInteger(obj.cell) ? obj.cell : -1;
    const b = boardOf(st, a);
    const id = cell >= 0 && cell < CELLS ? b[cell] : null;
    if (!id || st.marked.has(id)) return null;
    return { input: { cell, itemId: id }, value: null, error: null, elapsedMs: null, extra: { cell, itemId: id }, provisional: false };
  },
  finalizeRound(spec, subs) {
    const st = stateOf(spec);
    const values = new Map<string, { value: number | null; extra?: Record<string, unknown> }>();
    if (spec.params.phase === 'fill') {
      autoFill(st);
      for (const a of st.participants) values.set(a, { value: null, extra: { manual: st.manual.get(a) ?? 0 } });
      return { values, reveal: { phase: 'fill', manual: Object.fromEntries(st.participants.map((a) => [a, st.manual.get(a) ?? 0])) } };
    }
    const round = Number(spec.params.call);
    const picks = new Map([...subs.entries()].map(([a, s]) => [a, (s.extra?.itemId as string | undefined) ?? null] as const));
    const { calls, newBingo } = bingoCallRound(st, round, picks);
    for (const a of st.participants) {
      const call = calls.find((c) => c.accountId === a);
      values.set(a, {
        value: st.over ? bingoValue(st, a) : null,
        extra: { call: call?.label ?? null, auto: call?.auto ?? false, lines: linesOf(st, a), bingoAt: st.bingoAt.get(a) ?? null, marked: markedOf(st, boardOf(st, a)).filter(Boolean).length },
      });
    }
    return { values, reveal: { phase: 'call', round, calls: calls.map((c) => ({ accountId: c.accountId, label: c.label, auto: c.auto, onBoards: c.onBoards })), newBingo, over: st.over } };
  },
};
