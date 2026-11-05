// ★ R074 (§E) — 문항별 실측 집계 · 등급 어긋남 판정
import { describe, expect, it } from 'vitest';
import { aggregate, bucketOf, median, mismatchOf } from './play-stats-report.mjs';

const r = (qid, ms, ok = ms === null ? 0 : 1, extra = {}) => ({ question_id: qid, human_ms: ms, any_ok: ok, wrong: 0, skip: 0, started_at: '2026-11-01T00:00:00Z', grade: 3, worth: 2, ...extra });
describe('R074 play:stats', () => {
  it('넷 경계는 hint:solve 와 같다(10초 · 25초) · 봇만 따로', () => {
    expect(bucketOf(9_999, 1)).toBe('pre');
    expect(bucketOf(10_000, 1)).toBe('hint');
    expect(bucketOf(25_000, 1)).toBe('initial');
    expect(bucketOf(null, 0)).toBe('miss');
    expect(bucketOf(null, 2)).toBe('bot');
  });
  it('중앙값', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3);
  });
  it('문항별 — n · 비율(봇만은 분모에서 뺌) · 중앙 ms · 틀린 제출 · 건너뛰기 · 마지막 날', () => {
    const [q] = aggregate([
      r(7, 4000, 1, { wrong: 2 }),
      r(7, 12000, 1, { skip: 1 }),
      r(7, null, 0, { started_at: '2026-11-03T16:00:00Z' }),
      r(7, null, 3),
    ]);
    expect(q).toMatchObject({ id: '7', n: 4, humanN: 3, pre: 1, hint: 1, miss: 1, bot: 1, prePct: 33.3, missPct: 33.3, medianMs: 8000, wrong: 2, skipVotes: 1, lastSeen: '2026-11-04' });
  });
  it('등급 어긋남 — 4·5 힌트 전 ≥ 50% 쉬움 · 1·2 못 맞힘 ≥ 50% 어려움 · 3 은 70/60 · n < 3 은 판정 없음', () => {
    const base = { n: 4, bot: 0, pre: 0, miss: 0 };
    expect(mismatchOf({ ...base, grade: 5, pre: 2 })).toBe('easy');
    expect(mismatchOf({ ...base, grade: 4, pre: 1 })).toBeNull();
    expect(mismatchOf({ ...base, grade: 1, miss: 2 })).toBe('hard');
    expect(mismatchOf({ ...base, grade: 3, pre: 3 })).toBe('easy');
    expect(mismatchOf({ ...base, grade: 3, pre: 2, miss: 2 })).toBeNull();
    expect(mismatchOf({ ...base, grade: 3, miss: 3 })).toBe('hard');
    expect(mismatchOf({ n: 2, bot: 0, pre: 2, miss: 0, grade: 5 })).toBeNull();
    expect(mismatchOf({ n: 4, bot: 2, pre: 2, miss: 0, grade: 5 })).toBeNull(); // 사람 판 2
  });
});
