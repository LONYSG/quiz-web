import { describe, expect, it } from 'vitest';
import { autoAssignTeams, buildTeamResult, smallerTeam, teamStartBlock, teamWinBonus, teamWinner } from './team.js';

describe('팀전 (R079 · D-335)', () => {
  it('자동 배정 = joinOrder 순 블루부터 번갈아 (결정적)', () => {
    const m = autoAssignTeams([
      { accountId: 'c', joinOrder: 3 },
      { accountId: 'a', joinOrder: 1 },
      { accountId: 'd', joinOrder: 7 },
      { accountId: 'b', joinOrder: 2 },
      { accountId: 'e', joinOrder: 9 },
    ]);
    expect([...'abcde'].map((k) => m.get(k))).toEqual(['blue', 'red', 'blue', 'red', 'blue']);
  });
  it('새 입장 = 적은 팀 · 같으면 블루', () => {
    expect(smallerTeam([])).toBe('blue');
    expect(smallerTeam([{ team: 'blue' }])).toBe('red');
    expect(smallerTeam([{ team: 'blue' }, { team: 'red' }])).toBe('blue');
    expect(smallerTeam([{ team: 'red' }, { team: 'red' }, { team: 'blue' }, { team: null }])).toBe('blue');
  });
  it('시작 조건 = 두 팀 모두 1명 이상', () => {
    expect(teamStartBlock([{ team: 'blue' }, { team: 'red' }])).toBeNull();
    expect(teamStartBlock([{ team: 'blue' }, { team: 'blue' }])).not.toBeNull();
    expect(teamStartBlock([{ team: 'blue' }, { team: null }])).not.toBeNull();
  });
  it('보너스 = clamp(ceil(점수/4), 1, 5)', () => {
    expect([1, 4, 5, 6, 12, 13, 20, 99].map(teamWinBonus)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });
  it('승자 · 무승부 · completed 아니면 보너스 0', () => {
    expect(teamWinner({ blue: 3, red: 3 })).toBeNull();
    const ms = [
      { accountId: 'a', team: 'blue' as const, score: 10 },
      { accountId: 'b', team: 'red' as const, score: 4 },
      { accountId: 'c', team: 'blue' as const, score: 7 },
      { accountId: 'd', team: 'red' as const, score: 8 },
      { accountId: 'x', team: null, score: 50 },
    ];
    const r = buildTeamResult(ms, true);
    expect(r.blue).toEqual({ score: 17, members: ['a', 'c'] });
    expect(r.red).toEqual({ score: 12, members: ['b', 'd'] });
    expect(r.winner).toBe('blue');
    expect(r.bonus).toBe(5);
    expect(buildTeamResult(ms, false).bonus).toBe(0);
    expect(buildTeamResult([{ accountId: 'a', team: 'blue', score: 2 }, { accountId: 'b', team: 'red', score: 2 }], true)).toMatchObject({ winner: null, bonus: 0 });
  });
});
