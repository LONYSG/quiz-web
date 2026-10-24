import { describe, expect, it } from 'vitest';
import { PHOTO_HINT_CHOSUNG_MS, PHOTO_HINT_GENERAL_MS } from '@quiz/shared';
import { MINIGAME_DEFS } from './defs.js';
import type { RoundSpec } from './defs.js';

// ★★ R066 (D-283 · 찬종 #48) — 사진 힌트: 난이도 3 = 6초 분류 · 10초 초성 / 1 · 2 = 10초 초성만
describe('R066 사진 시간 힌트', () => {
  const live = MINIGAME_DEFS.photo.liveParams!;
  const spec = (secret: Record<string, unknown>) => ({ itemKey: 'p', params: {}, playMs: 20_000, seed: 1, secret }) as unknown as RoundSpec;
  it('난이도 3 — 6초 분류 → 10초 분류 + 초성', () => {
    const s = spec({ answers: ['벼루'], chosung: 'ㅂㄹ', general: '생활용품' });
    expect(live.times(s)).toEqual([PHOTO_HINT_GENERAL_MS, PHOTO_HINT_CHOSUNG_MS]);
    expect(live.at(s, 5_999)).toEqual({});
    expect(live.at(s, 6_000)).toEqual({ generalHint: '생활용품' });
    expect(live.at(s, 10_000)).toEqual({ generalHint: '생활용품', chosung: 'ㅂㄹ' });
  });
  it('난이도 1 · 2 — 10초 초성만', () => {
    const s = spec({ answers: ['벼루'], chosung: 'ㅂㄹ' });
    expect(live.times(s)).toEqual([PHOTO_HINT_CHOSUNG_MS]);
    expect(live.at(s, 9_999)).toEqual({});
    expect(live.at(s, 10_000)).toEqual({ chosung: 'ㅂㄹ' });
  });
});
