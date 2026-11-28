// =============================================================================
// ★★★ R125 B1 — 내 값(포인트 · 혼자 하기 기록 · 전적 · 상점)의 열쇠와 받는 법 한 곳 + 로비에 들어올 때 미리 읽기(warmMine).
//   첫 화면에 그려지는 것(띠 줄 · 포인트)은 앱이 켜질 때 계정과 같이 받는다(App — 로비 첫 그림에 다 있다).
//   창으로 여는 것(전적 · 상점)은 로비에서 뒤로 미리 읽는다 → 열 때 다 그려져 있다 · 연 뒤 한 번 새로 받아 조용히 바꾼다.
// =============================================================================

import type { SoloMeView } from '@quiz/shared';
import { fetchPoints, fetchShop, type PointBalance, type ShopView } from './api.js';
import { fetchSoloMe } from './solo/useSolo.js';
import { drop, put, warm } from './warm.js';
import { siteInfo } from './site.js';

export const MINE = { points: 'mine:points', soloMe: 'mine:soloMe', stats: 'mine:stats', shop: 'mine:shop' } as const;

export const loadPoints = (): Promise<PointBalance | null> => fetchPoints();
export const loadSoloMe = (): Promise<SoloMeView | null> => fetchSoloMe();
export const loadShop = (): Promise<ShopView | null> => fetchShop();
export async function loadStats<T>(): Promise<T | null> {
  const r = await fetch('/api/me/stats', { credentials: 'same-origin', cache: 'no-store' });
  return r.ok ? ((await r.json()) as T) : null;
}

export const warmPoints = () => warm(MINE.points, loadPoints);
export const warmSoloMe = () => warm(MINE.soloMe, loadSoloMe);
export const putSoloMe = (m: SoloMeView) => put(MINE.soloMe, m);

/** 공방 목록 세 종류(종류마다 'dir:<kind>' — Directory 가 읽는다) */
async function warmDirLists(): Promise<void> {
  try {
    const r = await fetch('/api/gongbang/lists', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as { lists?: Record<string, { rooms: unknown[]; more: boolean; total?: number }> };
    for (const [k, v] of Object.entries(j.lists ?? {})) put(`dir:${k}`, { rooms: v.rooms, more: v.more, total: v.total });
  } catch {
    /* 소켓 peek 이 다시 받는다 */
  }
}

/** 앱이 켜질 때(계정을 안 뒤) — 첫 화면 값은 기다리고(최대 waitMs) · 창 값은 뒤로 */
export async function warmMine(waitMs = 1500): Promise<void> {
  const s = siteInfo();
  const first: Promise<unknown>[] = [warmPoints()];
  if (s.solo || s.belt) first.push(warmSoloMe());
  if (s.gongbang) first.push(warmDirLists());
  await Promise.race([Promise.all(first), new Promise((r) => setTimeout(r, waitMs))]);
  setTimeout(() => {
    void warm(MINE.stats, loadStats, 30_000);
    void warm(MINE.shop, loadShop, 30_000);
  }, 600);
}

/** 로그아웃 — 다른 계정의 값이 남지 않게 */
export function forgetMine(): void {
  for (const k of Object.values(MINE)) drop(k);
  for (const k of ['quiz', 'draw', 'liar']) drop(`dir:${k}`);
}
