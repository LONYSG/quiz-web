// =============================================================================
// ★★★ 팀전 1차 (R079 · D-329 · D-335) — 블루 / 레드 두 팀 · 점수 합산 표시 · 이긴 팀 보너스
//
// ★ 찬종 2026-11-08: "블루팀 / 레드팀으로 나눠서 정렬 · 일단 다른 기능들은 필요 없고 각 팀의 점수를 합쳐서 표기만 · 팀 전용 채팅 필요 없음"
//   배정 = 방장 끌기 + 자동 배정 + 각자 고르기("1+2 기능 다") · 홀수(2:3)여도 합산 그대로 · 이긴 팀 전원에게 팀 점수에 비례한 보너스.
// ★ 순수 함수만 — 서버(배정 · 시작 조건 · 결과 · 보너스)와 클라이언트(칸 · 막대 · 결과 줄)가 같은 식을 쓴다.
// =============================================================================

export type Team = 'blue' | 'red';
export const TEAMS: readonly Team[] = ['blue', 'red'];

export function isTeam(v: unknown): v is Team {
  return v === 'blue' || v === 'red';
}

export function teamLabel(t: Team): '블루' | '레드' {
  return t === 'blue' ? '블루' : '레드';
}

/**
 * ★ 자동 배정 — 입장 순서(joinOrder)대로 블루 · 레드 번갈아(블루부터). 무작위 아님(결정적 — 같은 방이면 같은 결과).
 */
export function autoAssignTeams(members: readonly { accountId: string; joinOrder: number }[]): Map<string, Team> {
  const out = new Map<string, Team>();
  [...members]
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .forEach((m, i) => out.set(m.accountId, i % 2 === 0 ? 'blue' : 'red'));
  return out;
}

/** ★ 새로 들어온 사람의 팀 — 적은 팀(같으면 블루) */
export function smallerTeam(members: readonly { team: Team | null }[]): Team {
  let blue = 0;
  let red = 0;
  for (const m of members) {
    if (m.team === 'blue') blue += 1;
    else if (m.team === 'red') red += 1;
  }
  return red < blue ? 'red' : 'blue';
}

/** 팀 인원 */
export function teamCounts(members: readonly { team: Team | null }[]): { blue: number; red: number } {
  let blue = 0;
  let red = 0;
  for (const m of members) {
    if (m.team === 'blue') blue += 1;
    else if (m.team === 'red') red += 1;
  }
  return { blue, red };
}

export const TEAM_START_BLOCK_MESSAGE = '팀전은 두 팀에 한 명 이상 있어야 해요.';

/** ★ 시작 조건 — 두 팀 모두 1명 이상 (막는 이유 · 없으면 null) */
export function teamStartBlock(members: readonly { team: Team | null }[]): string | null {
  const c = teamCounts(members);
  return c.blue >= 1 && c.red >= 1 ? null : TEAM_START_BLOCK_MESSAGE;
}

/** 팀 점수 = 그 팀 사람 점수 합 (미니게임 순위 점수도 이미 score 에 있다) */
export function teamScores(members: readonly { team: Team | null; score: number }[]): { blue: number; red: number } {
  let blue = 0;
  let red = 0;
  for (const m of members) {
    if (m.team === 'blue') blue += m.score;
    else if (m.team === 'red') red += m.score;
  }
  return { blue, red };
}

export function teamWinner(s: { blue: number; red: number }): Team | null {
  if (s.blue === s.red) return null;
  return s.blue > s.red ? 'blue' : 'red';
}

/**
 * ★★ 팀 승리 보너스 (D-335) — 이긴 팀 **전원**에게 `clamp(ceil(이긴 팀 점수 / 4), 1, 5)` P.
 *   팀 점수 4 → 1P · 6 → 2P · 12 → 3P · 20 이상 → 5P. 무승부 · 끝까지 안 간 판은 0(부르는 쪽이 거른다).
 */
export const TEAM_BONUS = { DIVISOR: 4, MIN: 1, MAX: 5 } as const;

export function teamWinBonus(winnerScore: number): number {
  return Math.min(TEAM_BONUS.MAX, Math.max(TEAM_BONUS.MIN, Math.ceil(winnerScore / TEAM_BONUS.DIVISOR)));
}

/** 결과에 담는 팀 요약 (GameResultData.teams) */
export interface TeamResult {
  blue: { score: number; members: string[] };
  red: { score: number; members: string[] };
  winner: Team | null;
  /** 이긴 팀 한 사람당 보너스 P (무승부 · 끝까지 안 간 판 0) */
  bonus: number;
}

/**
 * ★ 결과 팀 요약 — members 는 팀이 있는 사람 · completed 가 아니면 보너스 0.
 */
export function buildTeamResult(
  members: readonly { accountId: string; team: Team | null; score: number }[],
  completed: boolean,
): TeamResult {
  const s = teamScores(members);
  const winner = teamWinner(s);
  return {
    blue: { score: s.blue, members: members.filter((m) => m.team === 'blue').map((m) => m.accountId) },
    red: { score: s.red, members: members.filter((m) => m.team === 'red').map((m) => m.accountId) },
    winner,
    bonus: completed && winner ? teamWinBonus(s[winner]) : 0,
  };
}
