import { describe, expect, it } from 'vitest';
import {
  capEmojiTokens,
  countEmojiTokens,
  EMOJI_PLACEHOLDER_RE,
  emojiOnlyTokens,
  protectEmojiTokens,
  specialToken,
  splitEmojiText,
  stripEmojiTokens,
} from './emojiText.js';
import { maskAnswers, MASK_SENTINEL } from './mask.js';
import { normalizeAnswer } from './normalize.js';

describe('★★★ 이모티콘 토큰 (R057)', () => {
  it('글자 · 유니코드 이모지 · 특별 토큰으로 나눈다 (합치면 원문)', () => {
    const t = `이순신${specialToken(12)}😂👍🏽 장군🇰🇷`;
    const parts = splitEmojiText(t);
    expect(parts.map((p) => p.kind)).toEqual(['text', 'sp', 'char', 'char', 'text', 'char']);
    expect(parts.map((p) => p.text).join('')).toBe(t);
    expect(countEmojiTokens(t)).toBe(4);
  });
  it('★ 판정용 글자 — 토큰을 빼면 정답과 같다', () => {
    expect(normalizeAnswer(stripEmojiTokens('이순신 😂:sp:3:'))).toBe('이순신');
    expect(normalizeAnswer(stripEmojiTokens('😂 :sp:3:'))).toBe('');
    expect(stripEmojiTokens('그냥 글')).toBe('그냥 글');
  });
  it('★★ 서버 — 가지지 않은 특별 토큰 버림 · 10개 넘는 토큰 버림', () => {
    expect(capEmojiTokens('a:sp:1::sp:2:b', (id) => id === 2)).toBe('a:sp:2:b');
    const many = '😀'.repeat(12);
    expect(countEmojiTokens(capEmojiTokens(many, () => true))).toBe(10);
    expect(capEmojiTokens(`${'😀'.repeat(10)}:sp:5:끝`, () => true)).toBe(`${'😀'.repeat(10)}끝`);
  });
  it('이모티콘만이면 토큰 목록 · 글자가 있으면 null', () => {
    expect(emojiOnlyTokens(' 😂 :sp:9: ')?.map((p) => p.kind)).toEqual(['char', 'sp']);
    expect(emojiOnlyTokens('ㅋ😂')).toBeNull();
    expect(emojiOnlyTokens('   ')).toBeNull();
  });
  it('★★ 마스킹은 글자 부분만 — 토큰을 끼워도 정답을 찾고 · 가리지 않은 토큰은 되돌린다', () => {
    const answers = ['이순신', '달'];
    const p = protectEmojiTokens('이😂순신 맞지?:sp:4:');
    const r = maskAnswers(p.text, answers, EMOJI_PLACEHOLDER_RE);
    expect(r.masked).toBe(true);
    expect(p.restore(r.text)).toBe(`${MASK_SENTINEL} 맞지?:sp:4:`);
    // 짧은 정답(2자 이하)은 메시지 전체가 정답일 때만 — 토큰은 빼고 본다
    const p2 = protectEmojiTokens('달😂');
    const r2 = maskAnswers(p2.text, answers, EMOJI_PLACEHOLDER_RE);
    expect(p2.restore(r2.text)).toBe(`${MASK_SENTINEL}😂`);
    // 토큰이 없으면 지금과 같다
    expect(maskAnswers('달라졌네', answers).masked).toBe(false);
  });
});
