// =============================================================================
// ★★★ 라이어 게임 (R082 · D-330 ⑵ ⑶ ⑷ · D-339) — 방 "방식" 의 하나(퀴즈 / 미니게임만 / 라이어)
//
// ★ 찬종 2026-11-08: "캐치마인드 · 라이어 게임은 미니게임이 아니라 방 설정 '방식' 에 추가" ·
//   "라이어 1 · 1바퀴만 돌며 한마디씩 · 투표 → 최다 득표자 최후의 항변 → 최종 투표 → 반대가 많으면 다른 사람을 다시 지목해 투표 →
//    확정되면 라이어 여부 공개 · 라이어가 키워드 맞히면 보너스 · 안 들키면 더 큰 보너스"
// ★ 숫자는 전부 여기 한 곳(플레이 뒤 바꾸기 쉽게). 서버(진행 · 판정)와 화면(표시)이 같이 쓴다.
// =============================================================================

export type RoomMode = 'quiz' | 'minigame' | 'liar';
export const ROOM_MODES: readonly RoomMode[] = ['quiz', 'minigame', 'liar'];
export function isRoomMode(v: unknown): v is RoomMode {
  return typeof v === 'string' && (ROOM_MODES as readonly string[]).includes(v);
}

export const LIAR = {
  MIN_PLAYERS: 3,
  ROUNDS: { MIN: 2, MAX: 10, DEFAULT: 5 },
  /** ⓐ 배정(주제 · 키워드/라이어 카드) */
  ASSIGN_MS: 5_000,
  /** ⓑ 설명 한 줄(차례마다) · 글자 수 */
  SAY_MS: 20_000,
  SAY_MAX: 60,
  /** ⓒ 투표 · 동률 재투표 */
  VOTE_MS: 15_000,
  REVOTE_MS: 10_000,
  /** 투표 공개(누가 누굴 찍었나) */
  TALLY_MS: 4_000,
  /** ⓓ 최후의 항변 */
  DEFENSE_MS: 20_000,
  /** ⓔ 찬반 */
  FINAL_MS: 10_000,
  /** 지목 최대 횟수(부결되면 다시 지목 — 이 수까지) */
  MAX_ACCUSE: 2,
  /** ⓕ 라이어 키워드 맞히기 · 공개 */
  GUESS_MS: 15_000,
  REVEAL_MS: 7_000,
  /** 점수 — 시민(라이어를 찾았을 때 그 지목 투표에서 라이어를 찍은 사람) · 라이어(못 들킴 · 들켰지만 키워드 맞힘) */
  SCORE_CITIZEN_HIT: 1,
  SCORE_LIAR_ESCAPE: 3,
  SCORE_LIAR_GUESS: 2,
} as const;

export type LiarPhase = 'assign' | 'describe' | 'vote' | 'revote' | 'tally' | 'defense' | 'final' | 'guess' | 'reveal';
export type LiarOutcome = 'caught' | 'escaped' | 'notfound';

export const LIAR_START_BLOCK = `라이어 게임은 ${LIAR.MIN_PLAYERS}명부터 할 수 있어요.`;
export const LIAR_TEAM_BLOCK = '팀전과 라이어 게임은 같이 켤 수 없어요.';

/** 투표 집계 — 득표 수 · 최다(동률이면 여럿) */
export function tallyVotes(votes: ReadonlyMap<string, string>): { counts: Map<string, number>; top: string[]; max: number } {
  const counts = new Map<string, number>();
  for (const t of votes.values()) counts.set(t, (counts.get(t) ?? 0) + 1);
  let max = 0;
  for (const n of counts.values()) max = Math.max(max, n);
  const top = max > 0 ? [...counts.entries()].filter(([, n]) => n === max).map(([a]) => a) : [];
  return { counts, top, max };
}

/** 찬반 — 낼 수 있는 사람(지목된 사람 빼고 · 접속 중) 과반이 "라이어다" 면 확정 */
export function finalPasses(yes: number, eligible: number): boolean {
  return eligible > 0 && yes * 2 > eligible;
}

/** 라운드 점수 */
export function liarRoundScores(r: { outcome: LiarOutcome; liar: string; guessOk: boolean; hitters: readonly string[] }): Map<string, number> {
  const out = new Map<string, number>();
  if (r.outcome === 'caught') {
    for (const a of r.hitters) if (a !== r.liar) out.set(a, LIAR.SCORE_CITIZEN_HIT);
    if (r.guessOk) out.set(r.liar, LIAR.SCORE_LIAR_GUESS);
  } else out.set(r.liar, LIAR.SCORE_LIAR_ESCAPE);
  return out;
}
