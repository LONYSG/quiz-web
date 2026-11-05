// ★ R073 (D-318 · D-319) — prefs 플래그 왕복: 새 플래그 둘을 받고 · 아닌 값은 버린다
import { describe, expect, it } from 'vitest';
import { sanitizePrefs } from './authRoutes.js';

describe('R073 prefs 플래그', () => {
  it('emojiHelpDismissed · tourSeen 은 boolean 만 남는다', () => {
    expect(sanitizePrefs({ emojiHelpDismissed: true, tourSeen: false })).toEqual({ emojiHelpDismissed: true, tourSeen: false });
    expect(sanitizePrefs({ emojiHelpDismissed: 'yes', tourSeen: 1 })).toEqual({});
  });
  it('옛 플래그(shopOpened · emojiGuideSeen)도 그대로', () => {
    expect(sanitizePrefs({ shopOpened: true, emojiGuideSeen: true, tourSeen: true })).toEqual({ shopOpened: true, emojiGuideSeen: true, tourSeen: true });
  });
  it('모르는 키는 버린다', () => {
    expect(sanitizePrefs({ hack: 1, tourSeen: true })).toEqual({ tourSeen: true });
  });
});

// ★ R074 (D-321 · D-322) — 자동 시연 플래그 · 사무실 테마
describe('R074 prefs', () => {
  it('emojiDemoSeen 은 boolean 만', () => {
    expect(sanitizePrefs({ emojiDemoSeen: true })).toEqual({ emojiDemoSeen: true });
    expect(sanitizePrefs({ emojiDemoSeen: 'y' })).toEqual({});
  });
  it("theme 'office' 를 받는다 · 모르는 테마는 버린다", () => {
    expect(sanitizePrefs({ theme: 'office' })).toEqual({ theme: 'office' });
    expect(sanitizePrefs({ theme: 'matrix' })).toEqual({});
  });
});
