// ★ R071 (0028 · D-308) — game_questions 등급 열 기록 · 0028 전 DB 면 옛 꼴로(기록이 빠지지 않게)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { sql: string; params: unknown[] }[] = [];
let missing = false;
vi.mock('./pool.js', () => ({
  query: vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (missing && sql.includes('target_grade')) throw Object.assign(new Error('column "target_grade" does not exist'), { code: '42703' });
    return { rows: [], rowCount: 1 };
  }),
}));

const input = { gameId: '7', questionIndex: 3, questionId: '42', epoch: 3, startedAt: 1_700_000_000_000, selectionStage: 1, targetGrade: 5, grade: 4, worth: 3 };

describe('insertGameQuestion (R071)', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
  });
  it('★ 열이 있으면 target_grade · grade · worth 를 함께 적는다', async () => {
    missing = false;
    const { insertGameQuestion } = await import('./gameQuestions.js');
    await insertGameQuestion(input);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('target_grade, grade, worth');
    expect(calls[0]!.params.slice(6)).toEqual([5, 4, 3]);
  });
  it('★★ 0028 전 DB(42703) → 옛 꼴로 다시 적고 · 다음부터는 바로 옛 꼴', async () => {
    missing = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { insertGameQuestion } = await import('./gameQuestions.js');
    await insertGameQuestion(input);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).not.toContain('target_grade');
    expect(calls[1]!.params).toHaveLength(6);
    await insertGameQuestion({ ...input, questionIndex: 4 });
    expect(calls).toHaveLength(3);
    expect(calls[2]!.sql).not.toContain('target_grade');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
