// =============================================================================
// ★★★ 퀴즈류 미니게임 항목 (R052 · 0018 — D-239)
//
// ★ 적재본(minigame_items · minigame_products — scripts/minigame-load.mjs 가 verified 만 넣는다)을 읽는다.
//   게임 시작 때 한 번 메모리로(퀴즈 출제 풀과 같은 꼴 — D-054) · 60초 캐시(여러 방이 동시에 시작해도 한 번 읽는다).
// ★ 그림은 여기서 읽지 않는다 — 화면이 /api/minigame/image/:imageId 로 받는다.
// =============================================================================

import { QUIZ_MINIGAME_KEYS, type QuizMinigameKey } from '@quiz/shared';
import { query } from './pool.js';

export interface QuizItem {
  id: string;
  game: QuizMinigameKey;
  payload: Record<string, unknown>;
  imageIds: string[];
  attribution: string | null;
  /** ★ R067 (D-299) — 수집 기준 날짜(minigame_items.as_of · 'YYYY-MM-DD') — 없으면 null */
  asOf: string | null;
}

export interface QuizProduct {
  productId: string;
  payload: Record<string, unknown> & { rows: { cc: string; countryKo: string; localPrice: number; currency: string; krw: number }[] };
  imageId: string | null;
  /** ★ R067 — 가격 · 환율 기준 날짜(minigame_products.as_of · fx_as_of) */
  asOf: string | null;
  fxAsOf: string | null;
}

export interface QuizData {
  items: Record<QuizMinigameKey, QuizItem[]>;
  products: Map<string, QuizProduct>;
  loadedAt: number;
}

let cache: QuizData | null = null;
const TTL_MS = 60_000;

export async function loadQuizData(force = false): Promise<QuizData> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  const [it, pr] = await Promise.all([
    query<{ item_id: string; game: string; payload: Record<string, unknown>; image_ids: string[]; attribution: string | null; as_of: string | null }>(
      `SELECT item_id, game, payload, image_ids, attribution, to_char(as_of, 'YYYY-MM-DD') AS as_of FROM minigame_items WHERE active ORDER BY item_id`,
    ),
    query<{ product_id: string; payload: QuizProduct['payload']; image_id: string | null; as_of: string | null; fx_as_of: string | null }>(
      `SELECT product_id, payload, image_id, to_char(as_of, 'YYYY-MM-DD') AS as_of, to_char(fx_as_of, 'YYYY-MM-DD') AS fx_as_of FROM minigame_products`,
    ),
  ]);
  const items = Object.fromEntries(QUIZ_MINIGAME_KEYS.map((k) => [k, [] as QuizItem[]])) as Record<QuizMinigameKey, QuizItem[]>;
  for (const r of it.rows) {
    const g = r.game as QuizMinigameKey;
    if (!items[g]) continue;
    items[g].push({ id: r.item_id, game: g, payload: r.payload, imageIds: r.image_ids, attribution: r.attribution, asOf: r.as_of });
  }
  cache = {
    items,
    products: new Map(pr.rows.map((r) => [r.product_id, { productId: r.product_id, payload: r.payload, imageId: r.image_id, asOf: r.as_of, fxAsOf: r.fx_as_of }])),
    loadedAt: Date.now(),
  };
  return cache;
}

/** 검사용 — 캐시 비우기 */
export function clearQuizDataCache(): void {
  cache = null;
}

/** 계정들의 퀴즈류 경험 — 계정 → "키|문항 id" */
export async function loadAllItemExperiences(accountIds: readonly string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const a of accountIds) out.set(a, new Set());
  if (accountIds.length === 0) return out;
  const r = await query<{ account_id: string; minigame_key: string; item_key: string }>(
    `SELECT account_id::text, minigame_key, item_key FROM minigame_item_experiences WHERE account_id = ANY($1::bigint[])`,
    [accountIds],
  );
  for (const row of r.rows) out.get(row.account_id)?.add(`${row.minigame_key}|${row.item_key}`);
  return out;
}

/** 그림 한 장 */
export async function loadMinigameImage(imageId: string): Promise<{ mime: string; data: Buffer } | null> {
  const r = await query<{ mime: string; data: Buffer }>(`SELECT mime, data FROM minigame_images WHERE image_id = $1`, [imageId]);
  return r.rows[0] ?? null;
}
