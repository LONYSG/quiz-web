// =============================================================================
// ★★★ R085 — OX 10연속 (D-342 · docs/18 §11): 문장 하나 = 판 하나 × 10 (choice 꼴)
//
// ★ 항목 = 적재본 minigame_items.game 'ox'(verified 만 · 실 DB 는 V042 verified 384). 고르기 = shared pickOxItems
//   (앞 5 grade 1 · 뒤 5 grade 2·3 · 같은 pairId 금지 · 같은 대분류 ≤ 3 · 본 사람 적은 것 먼저 · 이번 게임 쓴 것 피함).
// ★ 입력 { pick: true(O) | false(X), elapsedMs } — 5초 안 · 바꿀 수 있음(마지막 · 임시 값으로 셈) · 맞히면 값 = 마지막으로 누른 ms(시간 합 동점 가르기).
// ★ 경험 기록 남김(item 단위 'ox|<id>' — 엔진) · 공개 = 정답(O/X) + 해설 · 판 중에는 정답 없음.
// =============================================================================

import { OX_DUMMY, OX_PLAY_MS, OX_READY_MS, OX_REVEAL_MS, minigameInfo, pickOxItems } from '@quiz/shared';
import type { QuizItem } from '../db/minigameItems.js';
import type { BuildCtx, MinigameDef, RoundSpec } from './defs.js';
import { deviceElapsed } from './defs.js';

interface OxPayload {
  statement: string;
  answer: boolean;
  explanation: string;
  category: { l1: string; l2: string };
  grade: number;
  pairId: string | null;
}
const payloadOf = (it: QuizItem) => it.payload as unknown as OxPayload;

const spec = (i: number, seed: number, p: { id: string; statement: string; answer: boolean; explanation: string; l1: string; itemId: string | null; experiencedBy?: string[] }): RoundSpec => ({
  itemKey: p.id,
  ...(p.itemId ? { itemId: p.itemId } : {}),
  params: { statement: p.statement, category: p.l1, ...(p.itemId ? {} : { dummy: true }) },
  reveal: { answer: p.answer, explanation: p.explanation, statement: p.statement },
  secret: { answer: p.answer },
  ...(p.experiencedBy ? { experiencedBy: p.experiencedBy } : {}),
  playMs: OX_PLAY_MS,
  readyMs: OX_READY_MS,
  resultMs: OX_REVEAL_MS,
  seed: seed + i,
});

/** 10 문장 — 적재본에서 · 이번 게임에서 쓴 문장은 피한다(ctx.quiz.used 'ox|<id>') */
export function pickOx(seed: number, ctx: BuildCtx) {
  const q = ctx.quiz;
  if (!q) return null;
  const items = (q.data.items.ox ?? []).filter((it) => typeof payloadOf(it).statement === 'string' && typeof payloadOf(it).answer === 'boolean');
  const used = (q.used ??= new Set<string>());
  const lite = items.map((it) => ({ it, id: it.id, grade: Number(payloadOf(it).grade) || 2, l1: String(payloadOf(it).category?.l1 ?? ''), pairId: payloadOf(it).pairId ?? null }));
  const avoid = new Set(lite.filter((x) => used.has(`ox|${x.id}`)).map((x) => x.id));
  const exp = q.experienced;
  const pick = pickOxItems(lite, ctx.participants, (a, id) => exp.get(a)?.has(`ox|${id}`) ?? false, seed, { avoid });
  if (!pick) return null;
  for (const x of pick.items) used.add(`ox|${x.id}`);
  return { items: pick.items.map((x) => x.it), experiencedBy: pick.experiencedBy };
}

export const ox: MinigameDef = {
  key: 'ox',
  info: minigameInfo('ox'),
  countProvisional: true,
  buildRounds(seed, ctx) {
    if (ctx.practice) return OX_DUMMY.map((d, i) => spec(i, seed, { id: d.id, statement: d.statement, answer: d.answer, explanation: d.explanation, l1: d.l1, itemId: null }));
    const pick = pickOx(seed, ctx);
    if (!pick) return null;
    return pick.items.map((it, i) => {
      const p = payloadOf(it);
      return spec(i, seed, { id: it.id, statement: p.statement, answer: p.answer, explanation: p.explanation, l1: p.category?.l1 ?? '', itemId: it.id, experiencedBy: pick.experiencedBy.get(it.id) });
    });
  },
  parseInput(raw, sp, ctx) {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    if (typeof obj?.pick !== 'boolean') return null;
    const elapsed = deviceElapsed(obj, sp, ctx, true);
    if (elapsed === null) return null;
    const correct = obj.pick === Boolean(sp.secret?.answer);
    const changes = Number(ctx.prev?.extra?.changes ?? -1) + 1;
    return {
      input: { pick: obj.pick, elapsedMs: Math.round(elapsed), changes },
      value: correct ? Math.round(elapsed) : null,
      error: null,
      elapsedMs: elapsed,
      submitted: true,
      extra: { pick: obj.pick, correct, changes },
      provisional: true,
      feedback: { result: 'set', pick: obj.pick },
    };
  },
};
