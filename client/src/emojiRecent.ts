// =============================================================================
// ★★ 자주 쓰는 이모티콘 (R069 · 찬종 #70 "자주 쓰는 이모티콘 탭도 따로 있으면 좋을듯")
//
// ★ 최근 보낸(또는 입력창에 넣은) 이모티콘 순 · 12개 · 이 기기(localStorage)만 — 계정 저장은 하지 않는다(가벼운 편의).
// ★ 단축키 10칸(Alt+1~0) 설정과 무관하다. 특별 이모티콘도 넣는다(보여 줄 때 가진 것만 — 고르기 창이 거른다).
// =============================================================================

import { useSyncExternalStore } from 'react';

const KEY = 'qw.emoji.recent';
/** 탭에 보이는 수 */
export const RECENT_EMOJI_MAX = 12;

let cache: number[] | null = null;
const subs = new Set<() => void>();

function read(): number[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0).slice(0, RECENT_EMOJI_MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** 보낸 이모티콘을 맨 앞에(같은 것은 한 번만) */
export function pushRecentEmoji(id: number): void {
  if (!Number.isInteger(id) || id <= 0) return;
  cache = [id, ...read().filter((x) => x !== id)].slice(0, RECENT_EMOJI_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* 저장 못 해도 이번 화면에서는 보인다 */
  }
  for (const f of subs) f();
}

export function useRecentEmojis(): number[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    read,
    read,
  );
}
