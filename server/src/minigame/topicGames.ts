// =============================================================================
// ★★★ R080 — 미니게임 1차 (D-330 · D-337): 많이 말하기 · 겹치면 무효(주제 세트) · 객관식 5연속(퀴즈 문항 보기)
//
// ★ 많이 말하기(many): 주제 하나 · timeSec(기본 30) 동안 글 입력(Enter 마다) · 서버 판정 즉시 **본인에게만** ✓ / ✗ / 이미 말함
//   (남의 답 · 남의 개수 안 보임 — countProvisional 없음 · 제출 수 줄도 화면이 숨긴다) · 끝나면 전원 목록 · 나만 말한 답 · 못 말한 것 공개.
//   점수 = 맞힌 수 → 판 순위 점수(rankRound · 동점 공동). 0개는 값 없음(0점).
// ★ 겹치면 무효(unique): 판마다 다른 주제(3판) · 15초 · ★ R099 여러 답 · 남과 겹친 항목은 전원 0 · 판 점수 = 안 겹친 정답 수(옛: 답 하나 · 혼자만 1).
// ★ 객관식 5연속(choice · R090 10 → 5): 이 판의 출제 풀(game.pool)에서 **저장 보기(question_choices)가 있는** 알가치 ≥ 2 · 등급 1~3 · 이미 나온 문항 · 정답 제외 · 분야 섞어 5 ·
//   보기 = 대표 정답 + 저장된 오답 셋(정답 변형과 겹치면 그 문항은 건너뜀 · 순서는 시드로 섞음). ★ R090 — 옛 "풀에서 다른 대표 정답 뽑기"는 지움(보기 퀄리티 — 찬종 테스트 1).
//   고른 10문항은 game.usedQuestionIds · usedAnswerNorms 에 넣는다(본판이 뒤에 내지 않게). ★ 질문 경험으로 기록하지 않는다(보기로 본 것은 푼 게 아니다).
// ★ 주제 고르기: kind closed · 항목 20 이상 · 이 게임에서 쓴 주제 제외(usedTopics) · 참가자 중 그 세트를 본 사람이 적은 순(전원 본 세트는 뒤로).
//   경험 기록 = minigame_item_experiences(키 many/unique · item_key 'topic:<slug>').
// =============================================================================

import {
  CHOICE_COUNT,
  CHOICE_DUMMY,
  CHOICE_MAX_GRADE,
  CHOICE_MIN_WORTH,
  CHOICE_PLAY_MS,
  CHOICE_READY_MS,
  CHOICE_REVEAL_MS,
  MANY_DEFAULT_SEC,
  MANY_MAX_TRIES,
  MANY_REVEAL_MS,
  MANY_WRONG_KEEP,
  ORDER_ROUNDS,
  TOPIC_DUMMY,
  TOPIC_TEXT_MAX,
  UNIQUE_PLAY_MS,
  UNIQUE_REVEAL_MS,
  UNIQUE_ROUNDS,
  manyReveal,
  matchTopic,
  minigameInfo,
  flexCanon,
  normalizeAnswer,
  seededRandom,
  uniqueCount,
} from '@quiz/shared';
import { ambiguousHint, makeTopicSet, topicsForKey, type TopicSet } from '../db/topics.js';
import type { BuildCtx, MinigameDef, RoundSpec } from './defs.js';
import { deviceElapsed } from './defs.js';
import { isTestServer } from '../db/testGuard.js';

export const TOPIC_KEYS = new Set(['many', 'unique', 'order', 'bingo']);
/** ★ R081 — 주제 세트 게임이 한 판에 쓰는 세트 수 */
export const TOPIC_NEED: Readonly<Record<string, number>> = { many: 1, unique: UNIQUE_ROUNDS, order: ORDER_ROUNDS, bingo: 1 };
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** ★ 주제 n 개 — 쓴 주제 제외 · 본 사람 적은 순(같으면 시드 순) · 모자라면 null */
export function pickTopicSets(
  sets: readonly TopicSet[],
  n: number,
  seed: number,
  participants: readonly string[],
  experienced: ReadonlyMap<string, ReadonlySet<string>>,
  used: ReadonlySet<string>,
): TopicSet[] | null {
  const rnd = seededRandom((seed ^ 0x70b1c) >>> 0);
  // ★ R081 — 네 게임(많이 말하기 · 겹치면 무효 · 순서대로 · 빙고) 어느 것으로 봤어도 본 것
  const seen = (s: TopicSet) => participants.filter((a) => [...TOPIC_KEYS].some((k) => experienced.get(a)?.has(`${k}|topic:${s.topic}`))).length;
  // ★★ R090 (D-347 · 0035) — 같은 group 의 세트들은 **한 자리**(지하철 13 세트가 추첨을 독차지하지 않게) · 자리가 뽑히면 그 안에서 하나(본 사람 적은 것 중 균등)
  //   group 없는 세트는 한 세트 = 한 자리(전과 같음) · 자리가 n 보다 모자라면 남은 group 세트로 채운다
  const free = sets.filter((s) => !used.has(s.topic));
  const slots = new Map<string, TopicSet[]>();
  for (const s of free) {
    const key = s.group ? `g:${s.group}` : `t:${s.topic}`;
    (slots.get(key) ?? slots.set(key, []).get(key)!).push(s);
  }
  const chosen: TopicSet[] = [];
  const rest: TopicSet[] = [];
  for (const members of slots.values()) {
    const ranked = shuffle([...members], rnd).map((s) => ({ s, k: seen(s) }));
    const best = Math.min(...ranked.map((x) => x.k));
    const one = ranked.find((x) => x.k === best)!.s;
    chosen.push(one);
    for (const x of ranked) if (x.s !== one) rest.push(x.s);
  }
  const order = (list: TopicSet[]) =>
    shuffle(list, rnd)
      .map((s, i) => ({ s, k: seen(s), i }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map((x) => x.s);
  const pool = [...order(chosen), ...order(rest)];
  return pool.length >= n ? pool.slice(0, n) : null;
}

export function topicsFor(n: number, seed: number, ctx: BuildCtx, key = 'many'): TopicSet[] | null {
  if (ctx.practice) return TOPIC_DUMMY.slice(0, n).map((d) => makeTopicSet({ topic: d.topic, nameKo: d.nameKo, kind: 'closed', timeSec: MANY_DEFAULT_SEC }, d.items.map((x) => ({ id: x.id, name: x.name, variants: [...(x.variants ?? [])] }))));
  const q = ctx.quiz;
  if (!q) return null;
  const used = (q.usedTopics ??= new Set<string>());
  // ★ R081 — usedTopics 는 네 게임이 같이 쓴다(한 판 안 같은 주제가 두 게임에 안 나옴 — D-330 ⑸)
  const pick = pickTopicSets(topicsForKey(key, q.topics), n, seed, ctx.participants, q.experienced, used);
  if (pick) for (const s of pick) used.add(s.topic);
  return pick;
}

const objOf = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null);
const textOf = (raw: unknown): string | null => {
  const t = objOf(raw)?.text;
  if (typeof t !== 'string') return null;
  const s = [...t.trim()].slice(0, TOPIC_TEXT_MAX).join('');
  return s ? s : null;
};
// ★ R088 — ambiguous: 겹치는 이름 → 안내 글(서구 · 고성군 …) · 오답이지만 본인에게 "앞 동네를 붙여 주세요"
type Secret = { matcher: Map<string, string>; items: { id: string; label: string }[]; ambiguous?: Map<string, string> };
const secretOf = (spec: RoundSpec) => spec.secret as unknown as Secret;

// ─────────────────────────────────────────────────────────────────────────────
// 많이 말하기
// ─────────────────────────────────────────────────────────────────────────────
export const many: MinigameDef = {
  key: 'many',
  info: minigameInfo('many'),
  buildRounds(seed, ctx) {
    const sets = topicsFor(1, seed, ctx);
    if (!sets) return null;
    const s = sets[0]!;
    return [
      {
        itemKey: `topic:${s.topic}`,
        params: { topic: s.topic, nameKo: s.nameKo, ...(s.scope ? { scope: s.scope } : {}), timeSec: s.timeSec, total: s.items.length, ...(ctx.practice ? { dummy: true } : {}) },
        secret: { matcher: s.matcher, items: s.items.map((x) => ({ id: x.id, label: x.label })), ambiguous: s.ambiguous } as unknown as Record<string, unknown>,
        playMs: s.timeSec * 1000,
        readyMs: 1_500,
        resultMs: MANY_REVEAL_MS,
        seed,
      },
    ];
  },
  parseInput(raw, spec, ctx) {
    const text = textOf(raw);
    if (text === null) return null;
    const ex = ctx.prev?.extra ?? {};
    const found = [...((ex.found as string[] | undefined) ?? [])];
    const wrong = [...((ex.wrong as string[] | undefined) ?? [])];
    const tries = Number(ex.tries ?? 0) + 1;
    if (tries > MANY_MAX_TRIES) return null;
    const sec = secretOf(spec);
    const id = matchTopic(sec.matcher, text);
    const label = id ? (sec.items.find((x) => x.id === id)?.label ?? text) : null;
    let feedback: Record<string, unknown>;
    if (id && found.includes(id)) feedback = { result: 'dup', label, text, count: found.length };
    else if (id) {
      found.push(id);
      feedback = { result: 'ok', label, text, id, count: found.length };
    } else {
      const n = normalizeAnswer(text);
      if (!wrong.some((w) => normalizeAnswer(w) === n)) wrong.push(text);
      if (wrong.length > MANY_WRONG_KEEP) wrong.shift();
      const hint = ambiguousHint(sec.ambiguous, text);
      feedback = { result: 'wrong', text, count: found.length, ...(hint ? { hint } : {}) };
    }
    return {
      input: { last: text, tries },
      value: found.length > 0 ? found.length : null,
      error: null,
      elapsedMs: null,
      submitted: found.length > 0,
      extra: { found, wrong, count: found.length, tries },
      provisional: true,
      feedback,
    };
  },
  finalizeRound(spec, subs) {
    const sec = secretOf(spec);
    const found = new Map([...subs.entries()].map(([a, s]) => [a, (s.extra?.found as string[] | undefined) ?? []] as const));
    const r = manyReveal(found, sec.items.map((x) => x.id));
    const labelOf = new Map(sec.items.map((x) => [x.id, x.label]));
    const values = new Map<string, { value: number | null; extra?: Record<string, unknown> }>();
    for (const [a, ids] of found) values.set(a, { value: ids.length > 0 ? ids.length : null, extra: { only: r.only.get(a) ?? [] } });
    const shown = new Set([...found.values()].flat());
    return {
      values,
      reveal: {
        nameKo: spec.params.nameKo,
        total: sec.items.length,
        labels: Object.fromEntries([...shown].map((id) => [id, labelOf.get(id) ?? id])),
        missed: r.missed.map((id) => labelOf.get(id) ?? id),
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 겹치면 무효
// ★★★ R099 (찬종 #126 · 2026-11-12 폼 "여러 답 · 안 겹친 정답 수로 순위") — 판(15초) 동안 **여러 답**(Enter 마다 하나) ·
//   같은 사람의 같은 항목 · 같은 오답은 하나로 · 주제 목록 밖은 0(벌점 없음) · 남과 하나라도 겹친 항목은 그 항목이 전원 0 ·
//   판 점수 = 안 겹친 정답 수(scoring 'value') → 3판 합산 → 최종 순위(동점 공동) → 기존 순위 → 포인트 표.
//   옛 규칙(R080): 판마다 답 하나(마지막 것) · 혼자만 낸 정답 1.
//   기록: minigame_results.input = { texts: [...] }(낸 글 그대로 · 중복 뺀 것) · value = 안 겹친 정답 수(0 이면 null)
// ─────────────────────────────────────────────────────────────────────────────
export const unique: MinigameDef = {
  key: 'unique',
  info: minigameInfo('unique'),
  buildRounds(seed, ctx) {
    const sets = topicsFor(UNIQUE_ROUNDS, seed, ctx, 'unique');
    if (!sets) return null;
    return sets.map((s, i) => ({
      itemKey: `topic:${s.topic}`,
      params: { topic: s.topic, nameKo: s.nameKo, ...(s.scope ? { scope: s.scope } : {}), ...(ctx.practice ? { dummy: true } : {}) },
      secret: { matcher: s.matcher, items: s.items.map((x) => ({ id: x.id, label: x.label })), ambiguous: s.ambiguous } as unknown as Record<string, unknown>,
      playMs: UNIQUE_PLAY_MS,
      readyMs: 1_500,
      resultMs: UNIQUE_REVEAL_MS,
      seed: seed + i,
    }));
  },
  countProvisional: true,
  parseInput(raw, spec, ctx) {
    const text = textOf(raw);
    if (text === null) return null;
    const ex = ctx.prev?.extra ?? {};
    const found = [...((ex.found as string[] | undefined) ?? [])];
    const wrong = [...((ex.wrong as string[] | undefined) ?? [])];
    const texts = [...((ex.texts as string[] | undefined) ?? [])];
    const tries = Number(ex.tries ?? 0) + 1;
    if (tries > MANY_MAX_TRIES) return null;
    const sec = secretOf(spec);
    const id = matchTopic(sec.matcher, text);
    const label = id ? (sec.items.find((x) => x.id === id)?.label ?? text) : null;
    let feedback: Record<string, unknown>;
    if (id && found.includes(id)) feedback = { result: 'dup', label, text, count: found.length };
    else if (id) {
      found.push(id);
      texts.push(text);
      feedback = { result: 'ok', label, text, id, count: found.length };
    } else {
      const n = normalizeAnswer(text);
      const again = wrong.some((w) => normalizeAnswer(w) === n);
      if (!again && wrong.length < MANY_WRONG_KEEP) {
        wrong.push(text);
        texts.push(text);
      }
      const hint = ambiguousHint(sec.ambiguous, text);
      feedback = { result: again ? 'dupWrong' : 'wrong', text, count: found.length, ...(hint ? { hint } : {}) };
    }
    const labels = Object.fromEntries(found.map((x) => [x, sec.items.find((it) => it.id === x)?.label ?? x]));
    return {
      input: { texts },
      value: null,
      error: null,
      elapsedMs: num(objOf(raw)?.elapsedMs),
      submitted: texts.length > 0,
      extra: { found, wrong, texts, labels, tries },
      provisional: true,
      feedback,
    };
  },
  finalizeRound(spec, subs) {
    const sec = secretOf(spec);
    const found = new Map([...subs.entries()].map(([a, s]) => [a, (s.extra?.found as string[] | undefined) ?? []] as const));
    const r = uniqueCount(found);
    const labelOf = new Map(sec.items.map((x) => [x.id, x.label]));
    const values = new Map<string, { value: number | null; extra?: Record<string, unknown> }>();
    for (const [a, v] of r) values.set(a, { value: v.only.length > 0 ? v.only.length : null, extra: { only: v.only, dup: v.dup } });
    const shown = new Set([...found.values()].flat());
    return { values, reveal: { nameKo: spec.params.nameKo, labels: Object.fromEntries([...shown].map((id) => [id, labelOf.get(id) ?? id])) } };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 객관식 5연속
// ─────────────────────────────────────────────────────────────────────────────
export interface ChoiceQ {
  id: string;
  text: string;
  categoryName: string;
  categoryMid?: string | null;
  displayAnswer: string;
  answersNorm: readonly string[];
  /** ★ R090 — 정답 원문(저장 보기가 지운 꼴로 겹치는지 볼 때 · 없으면 대표 정답만) */
  answersRaw?: readonly string[];
  grade: number;
  worth: number | null;
}
export interface ChoicePick {
  q: ChoiceQ;
  options: string[];
  answer: number;
}

const glen = (s: string) => [...s].length;

/** ★ R090 (D-347) — 저장 보기(question_choices) 셋을 쓸 수 있나: 셋 이상 · 서로 다름 · 정답(정규화 · 지운 꼴 · 변형)과 안 겹침 → 쓸 셋(아니면 null — 그 문항은 건너뜀) */
export function storedDistractors(q: ChoiceQ, stored: readonly string[] | undefined, rnd: () => number, need = 3): string[] | null {
  if (!stored || stored.length < need) return null;
  const bad = new Set<string>();
  for (const a of [q.displayAnswer, ...(q.answersRaw ?? [])]) {
    bad.add(normalizeAnswer(a));
    bad.add(flexCanon(a));
  }
  for (const n of q.answersNorm) bad.add(n);
  const seen = new Set<string>();
  for (const o of stored) {
    const n = normalizeAnswer(o);
    if (typeof o !== 'string' || !o.trim() || !n || bad.has(n) || bad.has(flexCanon(o)) || seen.has(n)) return null;
    seen.add(n);
  }
  return shuffle([...stored], rnd).slice(0, need);
}

/** ★ 5문항 고르기 — **저장 보기가 있는 문항만**(R090) · 알가치 ≥ 2 · 등급 1~3 · 이미 나온 문항 · 정답 제외 · 분야(대분류) 돌아가며 · 정답끼리 겹치지 않게 */
export function pickChoiceQuestions(
  pool: readonly ChoiceQ[],
  opts: { usedIds: ReadonlySet<string>; usedNorms: ReadonlySet<string>; seed: number; count?: number; options: ReadonlyMap<string, readonly string[]> },
): ChoicePick[] | null {
  const count = opts.count ?? CHOICE_COUNT;
  const rnd = seededRandom((opts.seed ^ 0xc401ce) >>> 0);
  const ok = pool.filter(
    (q) =>
      opts.options.has(q.id) &&
      (q.worth ?? 2) >= CHOICE_MIN_WORTH &&
      q.grade >= 1 &&
      q.grade <= CHOICE_MAX_GRADE &&
      !opts.usedIds.has(q.id) &&
      !q.answersNorm.some((n) => opts.usedNorms.has(n)) &&
      glen(q.displayAnswer) <= 30,
  );
  const byCat = new Map<string, ChoiceQ[]>();
  for (const q of shuffle([...ok], rnd)) {
    let a = byCat.get(q.categoryName);
    if (!a) byCat.set(q.categoryName, (a = []));
    a.push(q);
  }
  const cats = shuffle([...byCat.keys()], rnd);
  const out: ChoicePick[] = [];
  const norms = new Set<string>();
  let guard = 0;
  while (out.length < count && cats.some((c) => (byCat.get(c)?.length ?? 0) > 0) && guard++ < 5000) {
    for (const c of cats) {
      if (out.length >= count) break;
      const list = byCat.get(c)!;
      while (list.length) {
        const q = list.shift()!;
        if (q.answersNorm.some((n) => norms.has(n)) || norms.has(normalizeAnswer(q.displayAnswer))) continue;
        const d = storedDistractors(q, opts.options.get(q.id), rnd);
        if (!d) continue;
        const options = shuffle([q.displayAnswer, ...d], rnd);
        out.push({ q, options, answer: options.indexOf(q.displayAnswer) });
        for (const n of q.answersNorm) norms.add(n);
        norms.add(normalizeAnswer(q.displayAnswer));
        break;
      }
    }
  }
  return out.length >= count ? out : null;
}

/** ★ R090 — 검사 서버(QUIZ_TEST_SERVER)만: 저장 보기가 없는 문항에 가짜 보기 셋(데이터가 오기 전에도 봇 · ui-check 가 돌게) */
export function fakeChoiceOptions(pool: readonly ChoiceQ[], stored: ReadonlyMap<string, readonly string[]>): Map<string, readonly string[]> {
  const m = new Map(stored);
  for (const q of pool) if (!m.has(q.id)) m.set(q.id, ['가짜 보기 하나', '가짜 보기 둘', '가짜 보기 셋']);
  return m;
}

const choiceSpec = (i: number, seed: number, p: { text: string; category: string; options: string[]; answer: number; questionId: string | null }): RoundSpec => ({
  itemKey: p.questionId ? `q:${p.questionId}` : `choice-dummy-${i + 1}`,
  params: { text: p.text, category: p.category, options: p.options, ...(p.questionId ? {} : { dummy: true }) },
  reveal: { answer: p.answer, answerText: p.options[p.answer], questionId: p.questionId },
  secret: { answer: p.answer },
  playMs: CHOICE_PLAY_MS,
  readyMs: CHOICE_READY_MS,
  resultMs: CHOICE_REVEAL_MS,
  seed: seed + i,
});

export const choice: MinigameDef = {
  key: 'choice',
  info: minigameInfo('choice'),
  noItemExperience: true,
  buildRounds(seed, ctx) {
    if (ctx.practice) {
      const rnd = seededRandom(seed >>> 0);
      return CHOICE_DUMMY.slice(0, CHOICE_COUNT).map((d, i) => {
        const options = shuffle([...d.options], rnd);
        return choiceSpec(i, seed, { text: d.text, category: d.category, options, answer: options.indexOf(d.options[0]), questionId: null });
      });
    }
    const g = ctx.game;
    if (!g || g.pool.length === 0) return null;
    // ★ R090 — 저장 보기만(옛 풀 뽑기 보기는 쓰지 않는다) · 검사 서버는 가짜 보기로 채움
    const stored = g.choiceOptions ?? new Map<string, readonly string[]>();
    const options = isTestServer() ? fakeChoiceOptions(g.pool, stored) : stored;
    const pick = pickChoiceQuestions(g.pool, { usedIds: g.usedQuestionIds, usedNorms: g.usedAnswerNorms, seed, options });
    if (!pick) return null;
    // ★ 본판이 이 5문제(와 같은 정답)를 뒤에 내지 않게
    for (const p of pick) {
      g.usedQuestionIds.add(p.q.id);
      for (const n of p.q.answersNorm) g.usedAnswerNorms.add(n);
    }
    return pick.map((p, i) => choiceSpec(i, seed, { text: p.q.text, category: p.q.categoryName, options: p.options, answer: p.answer, questionId: p.q.id }));
  },
  parseInput(raw, spec, ctx) {
    const obj = objOf(raw);
    const c = num(obj?.choice);
    const n = Array.isArray(spec.params.options) ? spec.params.options.length : 4;
    if (c === null || !Number.isInteger(c) || c < 0 || c >= n) return null;
    const elapsed = deviceElapsed(obj, spec, ctx, true);
    if (elapsed === null) return null;
    const correct = c === Number(spec.secret?.answer);
    return { input: { choice: c, elapsedMs: Math.round(elapsed) }, value: correct ? Math.round(elapsed) : null, error: null, elapsedMs: elapsed, extra: { choice: c, correct }, provisional: false };
  },
};
