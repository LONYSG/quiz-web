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
}

/** 고르는 창의 분류 탭 (순서 = 표시 순서). custom 은 직접 등록 — 있을 때만 보인다 */
export const EMOJI_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'custom', label: '직접 등록', icon: '⭐' },
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

let cache: { list: EmojiMeta[]; byId: Map<number, EmojiMeta>; defaults: number[] } | null = null;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  const res = await fetch('/api/emoji', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`emoji ${res.status}`);
  const json = (await res.json()) as { emojis: EmojiMeta[]; defaults: number[] };
  cache = { list: json.emojis, byId: new Map(json.emojis.map((e) => [e.id, e])), defaults: json.defaults };
  window.dispatchEvent(new CustomEvent('qw:emoji-catalog'));
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
