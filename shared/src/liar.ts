// =============================================================================
// ★★★ 라이어 게임 (R082 · D-330 ⑵ ⑶ ⑷ · D-339) — 방 "방식" 의 하나(퀴즈 / 미니게임만 / 라이어)
//
// ★ 찬종 2026-11-08: "캐치마인드 · 라이어 게임은 미니게임이 아니라 방 설정 '방식' 에 추가" ·
//   "라이어 1 · 1바퀴만 돌며 한마디씩 · 투표 → 최다 득표자 최후의 항변 → 최종 투표 → 반대가 많으면 다른 사람을 다시 지목해 투표 →
//    확정되면 라이어 여부 공개 · 라이어가 키워드 맞히면 보너스 · 안 들키면 더 큰 보너스"
// ★ R087 개정(D-344 · 테스트 1): 설명은 채팅과 분리된 설명칸 · 채팅은 늘 자유(키워드만 거부) · 변론도 설명칸 → 위쪽에 크게
//   · 투표는 바퀴(VOTE_BOUTS) — 지목 → 변론 → 죽일지/살릴지(살린다 ≥ 죽인다면 산다 → 전원 대상 다음 바퀴) · 시민을 죽이면 라이어 승
// ★ 숫자는 전부 여기 한 곳(플레이 뒤 바꾸기 쉽게). 서버(진행 · 판정)와 화면(표시)이 같이 쓴다.
// =============================================================================

/** ★ R083 — 'draw'(캐치마인드) 더함 · ★ R096 (D-353) — 'song'(노래 맞히기 — 퀴즈 흐름 그대로 · shared/src/songMode.ts) */
export type RoomMode = 'quiz' | 'minigame' | 'liar' | 'draw' | 'song';
export const ROOM_MODES: readonly RoomMode[] = ['quiz', 'minigame', 'liar', 'draw', 'song'];
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
  /** ⓔ 죽일지 / 살릴지 */
  FINAL_MS: 10_000,
  /** ★ R087 (D-344 · 찬종 "투표를 여러 번 거쳐서") — 투표 바퀴 상한: 한 바퀴 = 지목 투표(동률이면 동률자끼리 재투표 · 바퀴 안 REVOTES 번까지)
   *   → 변론 → 죽일지/살릴지. 살리면(또는 바퀴 안에서 못 정하면) 다음 바퀴 = 전원 대상 다시 투표. 이 수를 다 돌아도 못 죽이면 못 찾음(라이어 승) */
  VOTE_BOUTS: 3,
  REVOTES: 2,
  /** ⓕ 라이어 키워드 맞히기 · 공개 */
  GUESS_MS: 15_000,
  REVEAL_MS: 7_000,
  /** 점수 — 시민(라이어를 찾았을 때 그 지목 투표에서 라이어를 찍은 사람) · 라이어(못 들킴 · 들켰지만 키워드 맞힘) */
  SCORE_CITIZEN_HIT: 1,
  SCORE_LIAR_ESCAPE: 3,
  SCORE_LIAR_GUESS: 2,
  /** ★ R088 (D-345 · 18 §12) — 바보형에서 들킨 라이어가 키워드를 맞히면(기본형보다 낮게 — 설계 제안) */
  SCORE_LIAR_GUESS_FOOL: 1,
  /** ★ R090 (D-347 · 찬종 "안 들켰더라도 마지막에 정답 맞히는 기회 · 맞히면 추가 점수") — 살아남은 라이어(escaped · notfound)가 키워드도 맞히면 승리 점수에 더함(기본형 · 바보형 같음 · 못 맞혀도 깎지 않음) */
  SCORE_LIAR_SURVIVE_GUESS: 1,
  /** ★ R091 (D-348 · 찬종 "라이어가 이의제기했을 경우에만 투표") — 맞히기 오답 직후 라이어만 이의제기 버튼(APPEAL_MS) → 누르면 나머지 전원 인정/기각(APPEAL_VOTE_MS) */
  APPEAL_MS: 8_000,
  APPEAL_VOTE_MS: 10_000,
} as const;

/** ★ R088 (D-345 · 찬종 "기본형 / 바보형") — 기본형 = 라이어는 자기가 라이어인 걸 안다 · 바보형 = 라이어도 다른 단어(fool)를 정답처럼 받는다 */
export type LiarMode = 'basic' | 'fool';
export const LIAR_MODES: readonly LiarMode[] = ['basic', 'fool'];
export function isLiarMode(v: unknown): v is LiarMode {
  return v === 'basic' || v === 'fool';
}
export const LIAR_MODE_LABEL: Record<LiarMode, string> = { basic: '기본형', fool: '바보형' };

export type LiarPhase = 'assign' | 'describe' | 'vote' | 'revote' | 'tally' | 'defense' | 'final' | 'guess' | 'appeal' | 'appealVote' | 'reveal';
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

/** ★ R087 (D-344 · 찬종 "살린다 투표가 동률이거나 많을 경우 그 사람은 다시 산다") — 낸 표 중 죽인다가 살린다보다 많아야 죽인다 */
export function finalPasses(kill: number, save: number): boolean {
  return kill > save;
}

/** 라운드 점수 */
export function liarRoundScores(r: { outcome: LiarOutcome; liar: string; guessOk: boolean; hitters: readonly string[]; mode?: LiarMode }): Map<string, number> {
  const out = new Map<string, number>();
  if (r.outcome === 'caught') {
    for (const a of r.hitters) if (a !== r.liar) out.set(a, LIAR.SCORE_CITIZEN_HIT);
    if (r.guessOk) out.set(r.liar, r.mode === 'fool' ? LIAR.SCORE_LIAR_GUESS_FOOL : LIAR.SCORE_LIAR_GUESS);
  } else out.set(r.liar, LIAR.SCORE_LIAR_ESCAPE + (r.guessOk ? LIAR.SCORE_LIAR_SURVIVE_GUESS : 0));
  return out;
}

/** ★ R091 (D-348) — 이의제기 기록(liar_rounds.appeal · 공개 줄) */
export interface LiarAppeal {
  guess: string;
  yes: number;
  no: number;
  passed: boolean;
}

/** ★ R091 — 이의제기 버튼을 보일지: 답을 냈고(빈 답 · 시간 초과 아님) 오답 판정일 때만 */
export function canAppeal(guess: string | null, guessOk: boolean | null): boolean {
  return typeof guess === 'string' && guess.trim().length > 0 && guessOk === false;
}

/** ★ R091 — 인정 > 기각 이어야 인정(동률 · 아무도 안 누름 = 기각) */
export function appealPasses(yes: number, no: number): boolean {
  return yes > no;
}
