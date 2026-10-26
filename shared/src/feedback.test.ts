import { describe, expect, it } from 'vitest';
import { FEEDBACK_COMMENT_MAX, FEEDBACK_REASONS, RATE_CHOICES, RATE_POINTS, feedbackReasonLabel, parseFeedbackInput } from './feedback.js';

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
