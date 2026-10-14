// =============================================================================
// ★★ 이모티콘 목록 · 내 10칸 (R039 / D-187)
//
// ★ 이모티콘은 **번호(id)** 로 다룬다. 그림은 번호 → 목록에서 찾는다
//   (표준 = /emoji/<code>.svg · 직접 등록 = /api/emoji/<id>/image).
// ★ 내 10칸(Alt+1 ~ Alt+0)은 브라우저에 남기고, 로그인 중이면 계정에도 저장한다(prefsSync — D-157 과 같은 곳).
// =============================================================================

import { useEffect, useState } from 'react';

export interface EmojiMeta {
  id: number;
  kind: 'standard' | 'custom';
  code: string | null;
  char: string | null;
  name: string;
  tags: string[];
  category: string;
  /** ★ R048 — 특별 이모티콘의 테마 (없으면 null) */
  themeId: number | null;
}

/** ★ R049 — 테마 (이모티콘샵) */
export interface EmojiThemeMeta {
  id: number;
  key: string;
  name: string;
  price: number;
  active: boolean;
}

/** 고르는 창의 분류 탭 (순서 = 표시 순서). custom 은 직접 등록 — 있을 때만 보인다 */
export const EMOJI_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'custom', label: '직접 등록', icon: '⭐' },
  // ★ R049 — 뽑기로 얻은 특별 이모티콘 (가진 것이 있을 때만 보인다 — 찬종: "기존 이모티콘 탭 안에서 또 분리된 탭")
  { key: 'special', label: '특별', icon: '✨' },
  { key: 'smileys', label: '표정', icon: '😀' },
  { key: 'people', label: '손·사람', icon: '👋' },
  { key: 'animals', label: '동물·자연', icon: '🐶' },
  { key: 'food', label: '음식', icon: '🍔' },
  { key: 'activities', label: '활동', icon: '⚽' },
  { key: 'travel', label: '여행·장소', icon: '🚗' },
  { key: 'objects', label: '사물', icon: '💡' },
  { key: 'symbols', label: '기호', icon: '💯' },
  { key: 'flags', label: '깃발', icon: '🏁' },
];

export interface EmojiCatalog {
  list: EmojiMeta[];
  byId: Map<number, EmojiMeta>;
  defaults: number[];
  /** ★ R049 — 내가 가진 특별 이모티콘 (보낼 수 있는 것). 메타는 전원이 받지만(남이 보낸 것을 그리려고) 보내기는 가진 것만 */
  ownedSpecial: Set<number>;
  themes: EmojiThemeMeta[];
}

let cache: EmojiCatalog | null = null;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  const res = await fetch('/api/emoji', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`emoji ${res.status}`);
  const json = (await res.json()) as { emojis: EmojiMeta[]; defaults: number[]; ownedSpecial?: number[]; themes?: EmojiThemeMeta[] };
  cache = {
    list: json.emojis,
    byId: new Map(json.emojis.map((e) => [e.id, e])),
    defaults: json.defaults,
    ownedSpecial: new Set(json.ownedSpecial ?? []),
    themes: json.themes ?? [],
  };
  window.dispatchEvent(new CustomEvent('qw:emoji-catalog'));
}

/** ★ R049 — 뽑기 뒤(또는 다시 로그인) 목록을 다시 받는다. 받으면 qw:emoji-catalog 로 모두에게 알린다 */
export function reloadEmojiCatalog(): Promise<void> {
  if (!loading) loading = load().catch(() => undefined).finally(() => (loading = null));
  return loading;
}

/** 지금 받아 둔 목록 (훅 밖에서) */
export function peekEmojiCatalog(): EmojiCatalog | null {
  return cache;
}

/** 특별 이모티콘인가 (뽑기로 얻는 것 — 큰 반응 · 따로 세는 도배 방지) */
export function isSpecialEmoji(id: number): boolean {
  return cache?.byId.get(id)?.category === 'special';
}

// ── ★★ R049 — 특별 이모티콘 표시 방식 (찬종: "이건 실제로 봐야 알것 같네" → 두 가지를 그림으로 비교한다)
//   'float'  = 떠 있는 큰 반응 (채팅 입력창 바로 위 · 약 96px · 3초 · 최대 3개) + 로그엔 작은 그림 한 줄  ← 기본 (설계 권장)
//   'inline' = 로그 안에 크게 (96px 한 줄) — 대안. 찬종이 고르면 상수만 바꾼다 (D-231)
//   ★ 검사(ui-check)가 두 그림을 찍으려고 localStorage 'qw.specialDisplay' 로 바꿀 수 있다 — 사람 설정이 아니다
export type SpecialDisplay = 'float' | 'inline';
export const SPECIAL_DISPLAY_DEFAULT: SpecialDisplay = 'float';
export function specialDisplayMode(): SpecialDisplay {
  try {
    const v = localStorage.getItem('qw.specialDisplay');
    if (v === 'float' || v === 'inline') return v;
  } catch {
    /* 기본 */
  }
  return SPECIAL_DISPLAY_DEFAULT;
}

/** 목록 (처음 부를 때 한 번 받아 온다) */
export function useEmojiCatalog(): typeof cache {
  const [, force] = useState(0);
  useEffect(() => {
    const on = () => force((n) => n + 1);
    window.addEventListener('qw:emoji-catalog', on);
    if (!cache && !loading) loading = load().catch(() => undefined).finally(() => (loading = null));
    return () => window.removeEventListener('qw:emoji-catalog', on);
  }, []);
  return cache;
}

export function emojiSrc(e: EmojiMeta): string {
  return e.kind === 'custom' ? `/api/emoji/${e.id}/image` : `/emoji/${e.code}.svg`;
}

// ── 내 10칸 ────────────────────────────────────────────────────────────────
const KEY = 'qw.emoji.v1';

/** 저장된 10칸 (없거나 비면 null — 기본값을 쓴다) */
export function getStoredSlots(): number[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) && v.every((x) => Number.isInteger(x)) ? (v as number[]) : null;
  } catch {
    return null;
  }
}

export function setStoredSlots(slots: number[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(slots));
  } catch {
    /* 이번 세션만 */
  }
  window.dispatchEvent(new CustomEvent('qw:emoji-slots', { detail: slots }));
}

/** 실제로 쓸 10칸 — 저장된 것 중 목록에 없는 번호는 기본값으로 메운다 */
export function resolveSlots(stored: number[] | null, defaults: number[], byId: Map<number, EmojiMeta>): number[] {
  const out: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const s = stored?.[i];
    out.push(s !== undefined && byId.has(s) ? s : defaults[i] ?? defaults[0] ?? 0);
  }
  return out;
}

export function useEmojiSlots(): number[] {
  const cat = useEmojiCatalog();
  const [stored, setStored] = useState<number[] | null>(getStoredSlots());
  useEffect(() => {
    const on = (e: Event) => setStored((e as CustomEvent<number[]>).detail);
    window.addEventListener('qw:emoji-slots', on);
    return () => window.removeEventListener('qw:emoji-slots', on);
  }, []);
  return cat ? resolveSlots(stored, cat.defaults, cat.byId) : [];
}
