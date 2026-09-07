// =============================================================================
// 순위 계산 / 스킵 임계값 계산
//
// 둘 다 순수 함수다. 서버가 authoritative하게 계산하고(guide 44절) 클라이언트는 표시만 한다.
// =============================================================================

/**
 * 동점 공동 순위(경쟁 순위) 계산. guide 39절.
 *
 * 15, 15, 12 → 1위, 1위, 3위
 * 즉 동점자는 같은 순위를 받고, 다음 순위는 그만큼 건너뛴다.
 *
 * ★ 입력 순서를 보존하지 않는다. 점수 내림차순으로 정렬해 반환한다.
 */
export function computeRanking<T extends { score: number }>(
  players: readonly T[],
): Array<T & { rank: number }> {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  const out: Array<T & { rank: number }> = [];
  let previousScore: number | null = null;
  let previousRank = 0;

  sorted.forEach((player, index) => {
    const rank = player.score === previousScore ? previousRank : index + 1;
    previousScore = player.score;
    previousRank = rank;
    out.push({ ...player, rank });
  });

  return out;
}

/**
 * 스킵 투표 임계값. guide 22절 + Q-28(확정).
 *
 * 규칙
 *   · 기준은 현재 활성 플레이어의 80%
 *   · 80% 계산 결과가 전원 동의를 요구하게 되면 한 명 적은 수를 기준으로 한다
 *   · ★ 최소 2표를 하한으로 둔다 (Q-28). 0표나 1표로 스킵되는 것을 막는다
 *   · ★ 활성 1명이면 스킵 투표가 불가능하다. null을 반환한다
 *     (방장 강제 스킵만 가능하다. guide 23절)
 *
 * 확정된 표 (Q-28)
 *   2명=2 / 3명=2 / 4명=3 / 5명=4 / 6명=5 / 7명=6 / 8명=7 / 9명=8 / 10명=8
 *
 * ★ 분모는 해당 문제의 경험 여부와 무관한 전체 활성 플레이어다.
 *   경험자를 분모에서 빼면 투표 수로 경험자 수가 역산되어 정보가 샌다.
 *
 * @param activeCount 현재 활성(연결되어 있고 게임에 참가 중인) 플레이어 수
 * @returns 필요한 찬성 표 수, 또는 투표가 불가능하면 null
 */
export function skipThreshold(activeCount: number): number | null {
  if (!Number.isFinite(activeCount) || activeCount < 2) return null;

  let threshold = Math.ceil(activeCount * 0.8);
  // 80%가 전원 동의를 요구하게 되면 한 명 적은 수로 내린다 (guide 22절)
  if (threshold >= activeCount) threshold = activeCount - 1;
  // ★ 하한 2표 (Q-28)
  if (threshold < 2) threshold = 2;
  // 활성 인원보다 많은 표를 요구할 수는 없다
  if (threshold > activeCount) threshold = activeCount;

  return threshold;
}
