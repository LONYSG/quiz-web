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
