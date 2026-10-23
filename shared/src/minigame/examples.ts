// =============================================================================
// ★★ 미니게임 고르기 창의 퀴즈류 예시 (R063 · D-258 — 찬종 "보편적으로 잘 알고 이해하기 쉬운 거 예시 하나씩 … 그 예시는 문제로 나오지 않도록")
//
// ★ DB(minigame_items)와 무관한 고정 다섯. 예시와 같은 것이 문항으로 뽑히지 않게 서버가 exclude 낱말이 든 항목을 그 게임에서 뺀다
//   (server/src/minigame/defs.ts pickFor — payload 글에 낱말이 있으면 제외).
// =============================================================================

import type { MinigameKey } from '../minigame.js';

export interface MinigameExample {
  /** 묻는 것 */
  q: string;
  /** 답 */
  a: string;
  /** 이 낱말이 든 문항은 그 게임에서 뽑지 않는다 */
  exclude: readonly string[];
}

export const MINIGAME_EXAMPLES: Partial<Record<MinigameKey, MinigameExample>> = {
  price: { q: '신라면 1봉지', a: '약 1,000원', exclude: ['신라면'] },
  worldprice: { q: '스타벅스 아메리카노 — 한국 값을 보고 미국 값을 원화로', a: '가장 가까운 사람이 1등', exclude: ['아메리카노'] },
  photo: { q: '사진 한 장', a: '에펠탑', exclude: ['에펠'] },
  estimate: { q: '남산서울타워 높이는?', a: '약 237m', exclude: ['남산타워', '남산서울타워', 'N서울타워'] },
  which: { q: '더 먼저 생긴 것은? 직지 vs 훈민정음', a: '직지', exclude: ['직지', '훈민정음'] },
};

/** 그 게임의 예시와 겹치는 문항인가 (payload 를 글로 펼쳐 낱말을 찾는다) */
export function isExampleItem(key: MinigameKey, payload: unknown): boolean {
  const ex = MINIGAME_EXAMPLES[key];
  if (!ex) return false;
  const text = JSON.stringify(payload ?? '');
  return ex.exclude.some((w) => text.includes(w));
}
