import { describe, expect, it } from 'vitest';
import * as fb from './feedback.js';
import { FEEDBACK_REASONS, SONG_FEEDBACK_REASONS, feedbackReasonLabel } from './feedback.js';

// ★★★ R099 — 평가 입력은 뺐다(찬종 "평가는 나만 · 제보로"). 남은 것: 제보 📝 사유 코드 · 노래 사유 라벨(옛 기록 읽기)
describe('사유 코드 (제보 📝 · 옛 평가 기록 읽기)', () => {
  it('사유 일곱 · 라벨', () => {
    expect(FEEDBACK_REASONS.map((r) => r.code)).toEqual(['never_heard', 'too_easy', 'unclear', 'answer', 'hint', 'boring', 'other']);
    expect(feedbackReasonLabel('unclear')).toBe('질문이 무슨 말인지 모르겠음');
    expect(feedbackReasonLabel('zzz')).toBe('zzz');
  });
  it('노래 사유 넷(song:feedback 이 옛 기록 라벨로 읽는다)', () => {
    expect(SONG_FEEDBACK_REASONS.map((r) => r.code)).toEqual(['unknown', 'too_easy', 'label', 'preview']);
  });
  it('★ R099 — 평가 입력 함수 · 상수는 없다(공개 평가 1P · 평가 요청 추첨)', () => {
    for (const k of ['RATE_POINTS', 'RATE_CHOICES', 'pickRateAsk', 'rateAskCount', 'rateNeedsReason', 'parseFeedbackInput', 'parseSongFeedbackInput']) expect(k in fb).toBe(false);
  });
});
