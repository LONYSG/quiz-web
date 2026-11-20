// ★★★ R109 (D-369) — 자리 판별 · 공개 숨김 · 설정 거르기
import { describe, expect, it } from 'vitest';
import { FRIEND_ONLY_MINIGAMES, PUBLIC_MIN_ITEMS, validateRoomSettings, type QuizMinigameKey } from '@quiz/shared';
import { computePublicHidden, hostOnly, siteOfHost, siteSplit } from './site.js';
import { publicQuizData, type QuizData, type QuizItem } from './db/minigameItems.js';
import { DEFAULT_SETTINGS } from './rooms/registry.js';

const SPLIT = { publicHostname: 'quizdojang.com', friendHostname: 'beta.quizdojang.com', siteForce: null };

describe('siteOfHost', () => {
  it('PUBLIC_HOSTNAME 이 없으면 늘 지인(오늘과 같다)', () => {
    const c = { publicHostname: null, friendHostname: 'beta.quizdojang.com', siteForce: null };
    expect(siteOfHost('abc.trycloudflare.com', false, c)).toBe('friend');
    expect(siteOfHost('localhost:3000', true, c)).toBe('friend');
    expect(siteSplit(c)).toBe(false);
  });
  it('주소로 가른다 · 대소문자 · 포트', () => {
    expect(siteOfHost('beta.quizdojang.com', false, SPLIT)).toBe('friend');
    expect(siteOfHost('BETA.quizdojang.com:443', false, SPLIT)).toBe('friend');
    expect(siteOfHost('quizdojang.com', false, SPLIT)).toBe('public');
    expect(siteOfHost('www.quizdojang.com', false, SPLIT)).toBe('public');
    expect(siteSplit(SPLIT)).toBe(true);
  });
  it('모르는 주소 · 임시 주소는 공개(안전한 쪽) · 이 PC 의 localhost 만 지인', () => {
    expect(siteOfHost('x.trycloudflare.com', false, SPLIT)).toBe('public');
    expect(siteOfHost(undefined, false, SPLIT)).toBe('public');
    expect(siteOfHost('localhost:3000', true, SPLIT)).toBe('friend');
    // 터널을 지나온 것(CF 헤더 — local false)이 Host 를 localhost 로 꾸며도 지인이 아니다
    expect(siteOfHost('localhost:3000', false, SPLIT)).toBe('public');
  });
  it('SITE_FORCE 가 먼저', () => {
    expect(siteOfHost('beta.quizdojang.com', false, { ...SPLIT, siteForce: 'public' })).toBe('public');
    expect(siteOfHost('quizdojang.com', false, { publicHostname: null, friendHostname: null, siteForce: 'public' })).toBe('public');
    expect(siteSplit({ publicHostname: null, friendHostname: null, siteForce: 'friend' })).toBe(true);
  });
  it('hostOnly', () => {
    expect(hostOnly('[::1]:3000')).toBe('[::1]');
    expect(hostOnly('Quizdojang.com:80')).toBe('quizdojang.com');
  });
});

function item(game: QuizMinigameKey, id: string): QuizItem {
  return { id, game, payload: {}, imageIds: [id], attribution: null, asOf: null };
}
function data(counts: Partial<Record<QuizMinigameKey, [number, number]>>): QuizData {
  const items = { price: [], worldprice: [], photo: [], estimate: [], which: [], photoyear: [], song: [], ox: [] } as unknown as QuizData['items'];
  const friendOnlyItemIds = new Set<string>();
  for (const [k, [all, restricted]] of Object.entries(counts) as [QuizMinigameKey, [number, number]][]) {
    for (let i = 0; i < all; i += 1) {
      items[k].push(item(k, `${k}-${i}`));
      if (i < restricted) friendOnlyItemIds.add(`${k}-${i}`);
    }
  }
  return { items, products: new Map(), imageDims: new Map(), friendOnlyItemIds, friendOnlyImageIds: new Set(), loadedAt: Date.now() };
}

describe('공개 숨김 — 남는 항목 수로 센다', () => {
  it('얼마게요 297 중 288 지인 전용 → 9 남음 → 숨김 · 빅맥지수 323 중 39 → 284 남음 → 그대로', () => {
    const d = data({ price: [297, 288], worldprice: [323, 39], photo: [10, 0] });
    const h = computePublicHidden(d);
    expect(h.modes).toEqual(['song']);
    expect(h.minigames).toEqual(expect.arrayContaining([...FRIEND_ONLY_MINIGAMES, 'price']));
    expect(h.minigames).not.toContain('worldprice');
    // 원래 적은 게임(지인 전용 0)은 숫자가 적어도 숨기지 않는다
    expect(h.minigames).not.toContain('photo');
    const pub = publicQuizData(d);
    expect(pub.items.price.length).toBe(9);
    expect(pub.items.worldprice.length).toBe(284);
    expect(pub.items.price.some((x) => d.friendOnlyItemIds.has(x.id))).toBe(false);
    expect(9).toBeLessThan(PUBLIC_MIN_ITEMS);
  });
  it('지인 전용이 없으면 같은 적재본을 그대로', () => {
    const d = data({ photo: [30, 0] });
    expect(publicQuizData(d)).toBe(d);
  });
});

describe('validateRoomSettings — 공개 방 숨김', () => {
  const hidden = { modes: ['song' as const], minigames: ['song' as const, 'songyear' as const, 'price' as const] };
  it('노래 방식은 거절', () => {
    const v = validateRoomSettings({ ...DEFAULT_SETTINGS, mode: 'song' }, { hidden });
    expect(v.ok).toBe(false);
  });
  it('숨긴 미니게임은 골라 둔 설정에서도 빠진다 · 다른 것은 남는다', () => {
    const v = validateRoomSettings({ ...DEFAULT_SETTINGS, minigames: true, minigameKeys: ['price', 'worldprice', 'cake'] }, { hidden });
    expect(v.ok && [...v.settings.minigameKeys].sort()).toEqual(['cake', 'worldprice']);
  });
  it('숨김 없으면 오늘과 같다', () => {
    const a = validateRoomSettings({ ...DEFAULT_SETTINGS, minigames: true });
    const b = validateRoomSettings({ ...DEFAULT_SETTINGS, minigames: true }, { hidden: { modes: [], minigames: [] } });
    expect(b).toEqual(a);
  });
});
