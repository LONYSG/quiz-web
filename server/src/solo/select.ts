// =============================================================================
// ★★★ R118 (docs/24 4-3) — 솔로 문제 고르기 · **순수 함수**(await 없음 · 단위 테스트로 전 경로)
//
//   뽑기: 목표 등급(SOLO_RAMP)에서 · 이번 판에 안 나온 것 · 이번 판에 나온 정답과 안 겹치는 것(usedAnswerNorms — 방과 같은 규칙) ·
//         알가치 1 은 뺀다(풀을 만들 때 이미 뺐다) · 분야는 전부.
//   차례: ① 최근 내 솔로 200문항이 아닌 것 → ② 최근에 본 것이라도(같은 문제가 다시 나와도 된다 — 찬종) — 등급마다 이 순서
//         그 등급에 낼 문제가 없으면 아래 등급 → 위 등급(soloGradeOrder).
//   ★ 정답 흘림(앞 문제의 질문 · 해설에 이 문제의 정답이 들어 있음)은 같은 칸 안에서 뒤로 미룬다(방과 같은 answerLeaked).
// =============================================================================

import { soloGradeOrder } from '@quiz/shared';
import type { PoolQuestion } from '../db/questionPool.js';
import { answerLeaked } from '../game/select.js';

export interface SoloPickInput {
  /** 등급 → 그 등급의 문항(알가치 1 뺌) */
  byGrade: ReadonlyMap<number, readonly PoolQuestion[]>;
  grade: number;
  usedIds: ReadonlySet<string>;
  usedAnswerNorms: ReadonlySet<string>;
  /** 내 최근 솔로 문항 id(뒤로 미룬다) */
  recent: ReadonlySet<string>;
  shownNorm?: string;
  random?: () => number;
}

export interface SoloPick {
  question: PoolQuestion;
  /** 실제로 뽑힌 등급(목표와 다르면 아래 · 위 등급에서 채운 것) */
  grade: number;
  /** 최근 200 안의 문항을 다시 냈나 */
  repeated: boolean;
}

export function pickSoloQuestion(input: SoloPickInput): SoloPick | null {
  const rnd = input.random ?? Math.random;
  for (const g of soloGradeOrder(input.grade)) {
    const list = input.byGrade.get(g);
    if (!list || list.length === 0) continue;
    const ok = list.filter((q) => !input.usedIds.has(q.id) && !q.answersNorm.some((n) => input.usedAnswerNorms.has(n)));
    if (ok.length === 0) continue;
    const fresh = ok.filter((q) => !input.recent.has(q.id));
    const tier = fresh.length > 0 ? fresh : ok;
    const clean = tier.filter((q) => !answerLeaked(q, input.shownNorm));
    const from = clean.length > 0 ? clean : tier;
    const q = from[Math.min(from.length - 1, Math.floor(rnd() * from.length))]!;
    return { question: q, grade: g, repeated: fresh.length === 0 };
  }
  return null;
}

/** 풀(한 벌)에서 솔로 풀 만들기 — 분야가 있는 문항 전부 · 알가치 1 뺌 · 등급별로 */
export function buildSoloPool(all: readonly PoolQuestion[], topicOf: readonly (string | null)[]): Map<number, PoolQuestion[]> {
  const out = new Map<number, PoolQuestion[]>();
  for (let i = 0; i < all.length; i++) {
    const q = all[i]!;
    if (topicOf[i] == null || q.worth === 1) continue;
    const g = Math.max(1, Math.min(5, q.grade));
    let arr = out.get(g);
    if (!arr) out.set(g, (arr = []));
    arr.push(q);
  }
  return out;
}
