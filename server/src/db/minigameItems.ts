// =============================================================================
// ★★★ 퀴즈류 미니게임 항목 (R052 · 0018 — D-239)
//
// ★ 적재본(minigame_items · minigame_products — scripts/minigame-load.mjs 가 verified 만 넣는다)을 읽는다.
//   게임 시작 때 한 번 메모리로(퀴즈 출제 풀과 같은 꼴 — D-054) · 60초 캐시(여러 방이 동시에 시작해도 한 번 읽는다).
// ★ 그림은 여기서 읽지 않는다 — 화면이 /api/minigame/image/:imageId 로 받는다.
// =============================================================================

import { FRIEND_ONLY_IMAGE_LICENSE, FRIEND_ONLY_ITEM_IDS, QUIZ_MINIGAME_KEYS, type QuizMinigameKey } from '@quiz/shared';
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
  /** ★ R074 (§A · D-278 이어서) — 그림 id → [폭, 높이] (minigame_images.width · height). 화면이 받기 전에 칸 크기를 잡는다 */
  imageDims: Map<string, [number, number]>;
  /**
   * ★★★ R109 (D-369) — 지인 방에서만 내는 항목 id(그림 라이선스 product-page 를 쓰는 항목 — 제 그림 또는 빅맥지수의 상품 그림 · FRIEND_ONLY_ITEM_IDS).
   *   공개 방은 publicQuizData() 의 사본(이 항목이 빠진 것)을 쓴다.
   */
  friendOnlyItemIds: Set<string>;
  /** ★ R109 — 지인 전용 그림 id(그림 길이 공개 자리에서 404) */
  friendOnlyImageIds: Set<string>;
  loadedAt: number;
}

let cache: QuizData | null = null;
const TTL_MS = 60_000;

export async function loadQuizData(force = false): Promise<QuizData> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  const [it, pr, im] = await Promise.all([
    query<{ item_id: string; game: string; payload: Record<string, unknown>; image_ids: string[]; attribution: string | null; as_of: string | null }>(
      `SELECT item_id, game, payload, image_ids, attribution, to_char(as_of, 'YYYY-MM-DD') AS as_of FROM minigame_items WHERE active ORDER BY item_id`,
    ),
    query<{ product_id: string; payload: QuizProduct['payload']; image_id: string | null; as_of: string | null; fx_as_of: string | null }>(
      `SELECT product_id, payload, image_id, to_char(as_of, 'YYYY-MM-DD') AS as_of, to_char(fx_as_of, 'YYYY-MM-DD') AS fx_as_of FROM minigame_products`,
    ),
    // ★ R074 — 크기만(그림 바이트는 읽지 않는다)
    query<{ image_id: string; width: number; height: number; license: string | null; attribution: string | null }>(`SELECT image_id, width, height, license, attribution FROM minigame_images`),
  ]);
  // ★★★ R109 (D-369) — 정답 화면 출처 줄 = 그림마다 "저작자 (라이선스)"(CC BY · BY-SA 는 라이선스 표시가 의무 · "cropped" 같은 고침은 저작자 칸에 이미 있다).
  //   옛 줄(minigame_items.attribution)은 저작자만이었다. 상품 그림(product-page)은 라이선스 이름을 붙이지 않는다(공개 라이선스가 아니다)
  const imageCredit = new Map(
    im.rows.map((r) => {
      const who = (r.attribution ?? '').trim();
      const lic = (r.license ?? '').trim();
      const show = lic && lic !== FRIEND_ONLY_IMAGE_LICENSE ? lic : '';
      return [r.image_id, who && show ? `${who} (${show})` : who || show];
    }),
  );
  const creditOf = (ids: string[], fallback: string | null): string | null => {
    const parts = ids.map((x) => imageCredit.get(x) ?? '').filter(Boolean);
    return parts.length ? [...new Set(parts)].join(' · ') : fallback;
  };
  // ★ R109 — 지인 전용 그림 · 항목
  const friendOnlyImageIds = new Set(im.rows.filter((r) => r.license === FRIEND_ONLY_IMAGE_LICENSE).map((r) => r.image_id));
  const friendOnlyProducts = new Set(pr.rows.filter((r) => r.image_id && friendOnlyImageIds.has(r.image_id)).map((r) => r.product_id));
  const friendOnlyItemIds = new Set<string>(FRIEND_ONLY_ITEM_IDS);
  const items = Object.fromEntries(QUIZ_MINIGAME_KEYS.map((k) => [k, [] as QuizItem[]])) as Record<QuizMinigameKey, QuizItem[]>;
  for (const r of it.rows) {
    const g = r.game as QuizMinigameKey;
    if (!items[g]) continue;
    items[g].push({ id: r.item_id, game: g, payload: r.payload, imageIds: r.image_ids, attribution: creditOf(r.image_ids, r.attribution), asOf: r.as_of });
    const pid = typeof r.payload?.productId === 'string' ? r.payload.productId : null;
    if (r.image_ids.some((x) => friendOnlyImageIds.has(x)) || (pid && friendOnlyProducts.has(pid))) friendOnlyItemIds.add(r.item_id);
  }
  cache = {
    items,
    products: new Map(pr.rows.map((r) => [r.product_id, { productId: r.product_id, payload: r.payload, imageId: r.image_id, asOf: r.as_of, fxAsOf: r.fx_as_of }])),
    imageDims: new Map(im.rows.filter((r) => r.width > 0 && r.height > 0).map((r) => [r.image_id, [r.width, r.height] as [number, number]])),
    friendOnlyItemIds,
    friendOnlyImageIds,
    loadedAt: Date.now(),
  };
  publicCache = null;
  onQuizDataLoaded?.(cache);
  return cache;
}

/** ★ R109 — 읽을 때마다 자리 규칙(server/src/site.ts)이 공개 쪽 숨김 목록을 다시 센다 */
let onQuizDataLoaded: ((d: QuizData) => void) | null = null;
export function setOnQuizDataLoaded(fn: (d: QuizData) => void): void {
  onQuizDataLoaded = fn;
}

/**
 * ★★★ R109 (D-369) — 공개 방이 쓰는 사본: 지인 전용 항목을 뺀다(상품 · 그림 크기는 그대로 — 항목이 없으면 안 쓰인다). 같은 적재본이면 한 번만 만든다.
 */
let publicCache: { from: QuizData; data: QuizData } | null = null;
export function publicQuizData(d: QuizData): QuizData {
  if (d.friendOnlyItemIds.size === 0) return d;
  if (publicCache?.from === d) return publicCache.data;
  const items = Object.fromEntries(
    Object.entries(d.items).map(([k, list]) => [k, list.filter((it) => !d.friendOnlyItemIds.has(it.id))]),
  ) as Record<QuizMinigameKey, QuizItem[]>;
  const data: QuizData = { ...d, items };
  publicCache = { from: d, data };
  return data;
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
export async function loadMinigameImage(imageId: string): Promise<{ mime: string; data: Buffer; license: string | null } | null> {
  const r = await query<{ mime: string; data: Buffer; license: string | null }>(`SELECT mime, data, license FROM minigame_images WHERE image_id = $1`, [imageId]);
  return r.rows[0] ?? null;
}
