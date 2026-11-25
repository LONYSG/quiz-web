// ★★★ R109 (D-369) — 자리 판별 · 공개 숨김 · 설정 거르기
import { describe, expect, it } from 'vitest';
import { FRIEND_ONLY_MINIGAMES, minigameSelectable, NO_SITE_HIDDEN, PUBLIC_MIN_ITEMS, selectableMinigameKeys, setShowHiddenMinigames, validateRoomSettings, type QuizMinigameKey, type SiteHidden } from '@quiz/shared';
import { betaRedirectFor, computePublicHidden, friendGate, hostOnly, publicClosedFor, siteOfHost, siteSplit } from './site.js';
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
    const v = validateRoomSettings({ ...DEFAULT_SETTINGS, minigames: true, minigameKeys: ['price', 'estimate', 'cake'] }, { hidden });
    expect(v.ok && [...v.settings.minigameKeys].sort()).toEqual(['cake', 'estimate']);
  });
  it('숨김 없으면 오늘과 같다', () => {
    const a = validateRoomSettings({ ...DEFAULT_SETTINGS, minigames: true });
    const b = validateRoomSettings({ ...DEFAULT_SETTINGS, minigames: true }, { hidden: { modes: [], minigames: [] } });
    expect(b).toEqual(a);
  });
});

// ★ R110 — 빅맥지수를 뺐다(hidden) · 검사 서버 스위치를 끄면 고를 수 없고, 켜면(옛 회귀 검사) 보인다
describe('R110 빅맥지수 빼기', () => {
  it('일반 서버 — 목록 · 기본값 · 저장된 설정에서 빠진다(두 자리 모두)', () => {
    setShowHiddenMinigames(false);
    try {
      expect(minigameSelectable('worldprice')).toBe(false);
      expect(selectableMinigameKeys()).not.toContain('worldprice');
      expect(selectableMinigameKeys()).toContain('price');
      const pubHidden: SiteHidden = { modes: ['song'], minigames: ['song', 'songyear', 'price'] };
      for (const h of [NO_SITE_HIDDEN, pubHidden]) {
        const v = validateRoomSettings({ ...DEFAULT_SETTINGS, minigames: true, minigameKeys: ['worldprice', 'cake'] }, { hidden: h });
        expect(v.ok && v.settings.minigameKeys).toEqual(['cake']);
      }
    } finally {
      setShowHiddenMinigames(false);
    }
  });
  it('검사 서버(QUIZ_TEST_SERVER) — 보인다', () => {
    setShowHiddenMinigames(true);
    try {
      expect(minigameSelectable('worldprice')).toBe(true);
    } finally {
      setShowHiddenMinigames(false);
    }
  });
});

// ★★ R111 (D-371) — 닫힌 공개 자리 판별(표)
describe('publicClosedFor', () => {
  const base = { publicHostname: 'quizdojang.com', friendHostname: 'beta.quizdojang.com', siteForce: null };
  const rows: [string, Parameters<typeof publicClosedFor>[0], Parameters<typeof publicClosedFor>[1], boolean][] = [
    ['자리 안 가름(PUBLIC_HOSTNAME 없음) — 공개로 와도 닫힘 아님', 'public', { ...base, publicHostname: null }, false],
    ['자리 안 가름 — 베타', 'friend', { ...base, publicHostname: null }, false],
    ['베타 — 닫힘이어도 그대로', 'friend', base, false],
    ['공개 · PUBLIC_OPEN 없음 = 닫힘', 'public', base, true],
    ['공개 · PUBLIC_OPEN=0 = 닫힘', 'public', { ...base, publicOpen: false }, true],
    ['공개 · PUBLIC_OPEN=1 = 열림', 'public', { ...base, publicOpen: true }, false],
    ['SITE_FORCE=public(검사) · 닫힘', 'public', { ...base, publicHostname: null, siteForce: 'public' }, true],
    ['SITE_FORCE=public · 열림', 'public', { ...base, publicHostname: null, siteForce: 'public', publicOpen: true }, false],
    ['SITE_FORCE=friend', 'friend', { ...base, siteForce: 'friend' }, false],
  ];
  for (const [name, site, c, want] of rows) it(name, () => expect(publicClosedFor(site, c)).toBe(want));
  it('판별과 이어서 — 임시 주소(PUBLIC_HOSTNAME 없음)는 늘 열린 것과 같다', () => {
    const c = { ...base, publicHostname: null };
    expect(publicClosedFor(siteOfHost('abc.trycloudflare.com', false, c), c)).toBe(false);
  });
  it('판별과 이어서 — 공개 주소 · 모르는 Host 는 닫힘 · 베타 주소는 아님', () => {
    expect(publicClosedFor(siteOfHost('quizdojang.com', false, base), base)).toBe(true);
    expect(publicClosedFor(siteOfHost('evil.example', false, base), base)).toBe(true);
    expect(publicClosedFor(siteOfHost('beta.quizdojang.com', false, base), base)).toBe(false);
  });
});

// ★★★ R119 — 한 주소 운영(SITE_ONE) 켬 · 끔 표
describe('SITE_ONE 한 주소 운영', () => {
  const two = { publicHostname: 'quizdojang.com', friendHostname: 'beta.quizdojang.com', siteForce: null, publicOpen: false };
  const one = { ...two, siteOne: true };
  // [Host, local, 끔: 자리 · 닫힘 · 계정 검사 · 301] / [켬: 자리 · 닫힘 · 계정 검사 · 301]
  const rows: [string, boolean, [string, boolean, boolean, boolean], [string, boolean, boolean, boolean]][] = [
    ['quizdojang.com', false, ['public', true, false, false], ['friend', false, false, false]],
    ['www.quizdojang.com', false, ['public', true, false, false], ['friend', false, false, false]],
    ['beta.quizdojang.com', false, ['friend', false, true, false], ['friend', false, false, true]],
    ['localhost:3000', true, ['friend', false, true, false], ['friend', false, false, false]],
    ['evil.example', false, ['public', true, false, false], ['friend', false, false, false]],
  ];
  for (const [host, local, off, on] of rows) {
    it(`${host} — 끔`, () => {
      const s = siteOfHost(host, local, two);
      expect([s, publicClosedFor(s, two), friendGate(s, two), betaRedirectFor(host, '/', 'GET', two) !== null]).toEqual(off);
    });
    it(`${host} — 켬`, () => {
      const s = siteOfHost(host, local, one);
      expect([s, publicClosedFor(s, one), friendGate(s, one), betaRedirectFor(host, '/', 'GET', one) !== null]).toEqual(on);
    });
  }
  it('켬 — siteSplit false · SITE_FORCE 보다 먼저', () => {
    expect(siteSplit(one)).toBe(false);
    expect(siteOfHost('quizdojang.com', false, { ...one, siteForce: 'public' })).toBe('friend');
  });
  it('301 주소 — 경로 · 쿼리 그대로 · /api · 소켓 · /healthz · POST 는 안 보냄', () => {
    expect(betaRedirectFor('beta.quizdojang.com', '/r/ABC123?x=1', 'GET', one)).toBe('https://quizdojang.com/r/ABC123?x=1');
    expect(betaRedirectFor('BETA.quizdojang.com:443', '/', 'HEAD', one)).toBe('https://quizdojang.com/');
    expect(betaRedirectFor('beta.quizdojang.com', '/api/site', 'GET', one)).toBeNull();
    expect(betaRedirectFor('beta.quizdojang.com', '/socket.io/?EIO=4', 'GET', one)).toBeNull();
    expect(betaRedirectFor('beta.quizdojang.com', '/healthz', 'GET', one)).toBeNull();
    expect(betaRedirectFor('beta.quizdojang.com', '/', 'POST', one)).toBeNull();
    expect(betaRedirectFor('beta.quizdojang.com', '/', 'GET', { ...one, publicHostname: null })).toBeNull();
  });
});
