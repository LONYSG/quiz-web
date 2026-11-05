// ★ R071 (0028 · D-308) — game_questions 등급 열 기록 · 0028 전 DB 면 옛 꼴로(기록이 빠지지 않게)
// ★ R074 (0029) — rate_ask 열 · 0029 전 DB 면 rate_ask 만 빼고(등급 열은 그대로)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { sql: string; params: unknown[] }[] = [];
let missing: 'none' | 'rate' | 'grade' = 'none';
vi.mock('./pool.js', () => ({
  query: vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (missing !== 'none' && sql.includes('rate_ask')) throw Object.assign(new Error('column "rate_ask" does not exist'), { code: '42703' });
    if (missing === 'grade' && sql.includes('target_grade')) throw Object.assign(new Error('column "target_grade" does not exist'), { code: '42703' });
    return { rows: [], rowCount: 1 };
  }),
}));

const input = { gameId: '7', questionIndex: 3, questionId: '42', epoch: 3, startedAt: 1_700_000_000_000, selectionStage: 1, targetGrade: 5, grade: 4, worth: 3, rateAsk: true };

describe('insertGameQuestion (R071 · R074)', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
  });
  it('★ 열이 다 있으면 target_grade · grade · worth · rate_ask 를 함께 적는다', async () => {
    missing = 'none';
    const { insertGameQuestion } = await import('./gameQuestions.js');
    await insertGameQuestion(input);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('target_grade, grade, worth, rate_ask');
    expect(calls[0]!.params.slice(6)).toEqual([5, 4, 3, true]);
  });
  it('★★ 0029 전 DB → rate_ask 만 빼고 다시(등급 열은 그대로) · 다음부터는 바로', async () => {
    missing = 'rate';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { insertGameQuestion } = await import('./gameQuestions.js');
    await insertGameQuestion(input);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).toContain('target_grade');
    expect(calls[1]!.sql).not.toContain('rate_ask');
    await insertGameQuestion({ ...input, questionIndex: 4 });
    expect(calls).toHaveLength(3);
    expect(calls[2]!.sql).not.toContain('rate_ask');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it('★★ 0028 전 DB(42703) → 옛 꼴로 다시 적고 · 다음부터는 바로 옛 꼴', async () => {
    missing = 'grade';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { insertGameQuestion } = await import('./gameQuestions.js');
    await insertGameQuestion(input);
    expect(calls).toHaveLength(3);
    expect(calls[2]!.sql).not.toContain('target_grade');
    expect(calls[2]!.params).toHaveLength(6);
    await insertGameQuestion({ ...input, questionIndex: 4 });
    expect(calls).toHaveLength(4);
    expect(calls[3]!.sql).not.toContain('target_grade');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it('★ R074 loadRateAsked — 행이 있으면 true · 0029 전이면 false', async () => {
    missing = 'none';
    const { loadRateAsked } = await import('./gameQuestions.js');
    expect(await loadRateAsked('7', '42')).toBe(true);
    expect(calls[0]!.sql).toContain('rate_ask');
  });
});
