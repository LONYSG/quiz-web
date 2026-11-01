import { describe, expect, it } from 'vitest';
import { FEEDBACK_COMMENT_MAX, FEEDBACK_REASONS, RATE_CHOICES, RATE_POINTS, feedbackReasonLabel, parseFeedbackInput, pickRateAsk, rateAskCount, rateNeedsReason } from './feedback.js';

const base = { questionId: '12', gameId: '34' };

describe('parseFeedbackInput (R056 문제 평가)', () => {
  it('👎 + 사유 + 의견 — 사유는 상수 순서 · 중복 제거 · 의견 trim', () => {
    const r = parseFeedbackInput({ ...base, vote: -1, reasons: ['boring', 'never_heard', 'boring'], comment: '  너무 어려워요 ' });
    expect(r).toEqual({ ok: true, value: { ...base, vote: -1, reasons: ['never_heard', 'boring'], comment: '너무 어려워요' } });
  });
  it('👍 는 사유 · 의견을 버린다', () => {
    const r = parseFeedbackInput({ ...base, vote: 1, reasons: ['unclear'], comment: '좋아요' });
    expect(r).toEqual({ ok: true, value: { ...base, vote: 1, reasons: [], comment: null } });
  });
  it('취소(null)', () => {
    expect(parseFeedbackInput({ ...base, vote: null })).toEqual({ ok: true, value: { ...base, vote: null, reasons: [], comment: null } });
  });
  it('숫자 id 도 받는다', () => {
    const r = parseFeedbackInput({ questionId: 12, gameId: 34, vote: -1 });
    expect(r.ok && r.value.questionId).toBe('12');
  });
  it('사유 밖 · 글 아닌 사유는 거부', () => {
    expect(parseFeedbackInput({ ...base, vote: -1, reasons: ['hard'] }).ok).toBe(false);
    expect(parseFeedbackInput({ ...base, vote: -1, reasons: [1] }).ok).toBe(false);
    expect(parseFeedbackInput({ ...base, vote: -1, reasons: 'unclear' }).ok).toBe(false);
  });
  it('200자 — 딱 200 은 되고 201 은 거부 · 빈 의견은 null', () => {
    expect(parseFeedbackInput({ ...base, vote: -1, comment: '가'.repeat(FEEDBACK_COMMENT_MAX) }).ok).toBe(true);
    expect(parseFeedbackInput({ ...base, vote: -1, comment: '가'.repeat(FEEDBACK_COMMENT_MAX + 1) }).ok).toBe(false);
    const r = parseFeedbackInput({ ...base, vote: -1, comment: '   ' });
    expect(r.ok && r.value.comment).toBe(null);
  });
  it('vote · id 이상하면 거부', () => {
    expect(parseFeedbackInput({ ...base, vote: 2 }).ok).toBe(false);
    expect(parseFeedbackInput({ ...base, vote: 0.5 }).ok).toBe(false);
    expect(parseFeedbackInput({ ...base }).ok).toBe(false);
    expect(parseFeedbackInput({ ...base, questionId: 'x1', vote: 1 }).ok).toBe(false);
    expect(parseFeedbackInput({ ...base, gameId: '', vote: 1 }).ok).toBe(false);
    expect(parseFeedbackInput(null).ok).toBe(false);
  });
  it('★ R068 — 😐 그냥(0)은 받고 사유 · 의견은 버린다 · 3단계 순서', () => {
    const r = parseFeedbackInput({ ...base, vote: 0, reasons: ['unclear'], comment: '글' });
    expect(r.ok && r.value).toEqual({ questionId: base.questionId, gameId: base.gameId, vote: 0, reasons: [], comment: null });
    expect(RATE_CHOICES.map((c) => c.vote)).toEqual([1, 0, -1]);
    expect(RATE_POINTS).toBe(1);
  });
  it('사유 일곱 · 라벨', () => {
    expect(FEEDBACK_REASONS.map((r) => r.code)).toEqual(['never_heard', 'too_easy', 'unclear', 'answer', 'hint', 'boring', 'other']);
    expect(feedbackReasonLabel('unclear')).toBe('질문이 무슨 말인지 모르겠음');
    expect(feedbackReasonLabel('zzz')).toBe('zzz');
  });
});

// ★★ R071 (D-313) — 👎 사유 필수 1P · 평가 요청 무작위 1/3
describe('R071 평가 손질', () => {
  it('★ 사유 없는 👎 만 needReason — 👍 😐 · 사유 있는 👎 는 아니다', () => {
    expect(rateNeedsReason(-1, [])).toBe(true);
    expect(rateNeedsReason(-1, ['unclear'])).toBe(false);
    expect(rateNeedsReason(1, [])).toBe(false);
    expect(rateNeedsReason(0, [])).toBe(false);
    expect(rateNeedsReason(null, [])).toBe(false);
    // parseFeedbackInput 은 그대로 — 사유 없는 👎 도 받는다(저장만 · 포인트는 서버가 미룬다)
    const r = parseFeedbackInput({ ...base, vote: -1 });
    expect(r.ok && r.value.reasons).toEqual([]);
  });
  it('★ 요청 수 = ceil(n/3) · 2~3 문항이면 1 · 0 이면 0', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 10, 30, 50].map(rateAskCount)).toEqual([0, 1, 1, 1, 2, 2, 3, 4, 10, 17]);
  });
  it('★ pickRateAsk — 1..n 안 · 겹침 없음 · 오름차순 · 개수 ceil(n/3) (여러 번 · 여러 n)', () => {
    for (const n of [1, 2, 3, 5, 10, 20, 30, 50]) {
      for (let t = 0; t < 50; t += 1) {
        const got = pickRateAsk(n);
        expect(got.length).toBe(Math.ceil(n / 3));
        expect(new Set(got).size).toBe(got.length);
        expect(got.every((i) => Number.isInteger(i) && i >= 1 && i <= n)).toBe(true);
        expect([...got].sort((a, b) => a - b)).toEqual(got);
      }
    }
    expect(pickRateAsk(0)).toEqual([]);
  });
  it('★ 무작위 — 10 문항 2,000 판에서 순번마다 고르게(각 ≈ 40%)', () => {
    const hit = new Array(11).fill(0);
    for (let t = 0; t < 2000; t += 1) for (const i of pickRateAsk(10)) hit[i] += 1;
    for (let i = 1; i <= 10; i += 1) expect(hit[i] / 2000).toBeGreaterThan(0.33), expect(hit[i] / 2000).toBeLessThan(0.47);
  });
});
